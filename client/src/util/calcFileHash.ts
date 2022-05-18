import SparkMD5 from 'spark-md5'

/**
 * 抽样计算hash值 大概是1G文件花费1S的时间
 * 
 * 采用抽样hash的方式来计算hash
 * 我们在计算hash的时候，将超大文件以2M进行分割获得到另一个chunks数组，
 * 第一个元素(chunks[0])和最后一个元素(chunks[-1])我们全要了
 * 其他的元素(chunks[1,2,3,4....])我们再次进行一个分割，这个时候的分割是一个超小的大小比如2kb，我们取* 每一个元素的头部，尾部，中间的2kb。
 *  最终将它们组成一个新的文件，我们全量计算这个新的文件的hash值。
 * @param file {File}
 * @returns 
 */
export async function calcHashSample(file: File) {
  return new Promise(resolve => {
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();
    // 文件大小
    const size = file.size;
    let offset = 2 * 1024 * 1024;
    let chunks = [file.slice(0, offset)];
    // 前面2mb的数据
    let cur = offset;
    /**
     * 
     */
    while (cur < size) {
      // 最后一块全部加进来
      if (cur + offset >= size) {
        chunks.push(file.slice(cur, cur + offset));
      } else {
        // 中间的 前中后去两个字节
        const mid = cur + offset / 2;
        const end = cur + offset;
        chunks.push(file.slice(cur, cur + 2));
        chunks.push(file.slice(mid, mid + 2));
        chunks.push(file.slice(end - 2, end));
      }
      // 前取两个字节
      cur += offset;
    }
    // 拼接
    reader.readAsArrayBuffer(new Blob(chunks));
    // 最后100K
    reader.onload = e => {
      spark.append(e.target?.result as ArrayBuffer);
      resolve({ hashValue: spark.end(), progress: 100 });
    };
  });
}

/**
 * 使用分片和web-work 全量计算hash值
 * @param file {File}
 * @returns 
 */
export async function calcHashByWebWorker(file: File) {
  // 每一个片段都是2M
  const size = 2 * 1024 * 1024;
  let chunks: any[] = [];
  let cur = 0;
  while (cur < file.size) {
    chunks.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }

  return new Promise(resolve => {
    // web-worker 防止卡顿主线程
    const workder = new Worker(new URL('./../worker/hash.worker.ts', import.meta.url));
    workder.postMessage({ chunks });
    workder.onmessage = e => {
      const { progress, hash } = e.data;
      if (hash) {
        resolve({ hashValue: hash, progress });
      }
    };
  });
}

/**
 * 分片 web-worker 抽样计算hash值
 * @param file 
 * @returns 
 */
export async function calcHashSampleByWebWorker(file: File) {
  // 文件大小
  const size = file.size as number;
  let offset = 2 * 1024 * 1024;
  let chunks = [file.slice(0, offset)];
  // 前面100K
  let cur = offset;
  /**
   * 采用抽样hash的方式来计算hash
   * 我们在计算hash的时候，将超大文件以2M进行分割获得到另一个chunks数组，
   * 第一个元素(chunks[0])和最后一个元素(chunks[-1])我们全要了
   * 其他的元素(chunks[1,2,3,4....])我们再次进行一个分割，这个时候的分割是一个超小的大小比如2kb，我们取* 每一个元素的头部，尾部，中间的2kb。
   *  最终将它们组成一个新的文件，我们全量计算这个新的文件的hash值。
   */
  while (cur < size) {
    // 最后一块全部加进来
    if (cur + offset >= size) {
      chunks.push(file.slice(cur, cur + offset));
    } else {
      // 中间的 前中后去两个字节
      const mid = cur + offset / 2;
      const end = cur + offset;
      chunks.push(file.slice(cur, cur + 2));
      chunks.push(file.slice(mid, mid + 2));
      chunks.push(file.slice(end - 2, end));
    }
    cur += offset;
  }

  return new Promise(resolve => {
    // web-worker 防止卡顿主线程
    const workder = new Worker(new URL('./../worker/simple-hash.work.ts', import.meta.url));
    workder.postMessage({ chunks: chunks });
    workder.onmessage = e => {
      const { progress, hash } = e.data;
      if (hash) {
        resolve({ hashValue: hash, progress });
      }
    };
  });
}


/**
 * 全量计算hash值, 最慢,占用主进程
 * @param file 
 * @returns 
 */
export async function calcHashSync(file: File) {
  const size = 2 * 1024 * 1024;
  let chunks: any[] = [];
  let cur = 0;
  while (cur < file.size) {
    chunks.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }
  let hashProgress = 0
  return new Promise(resolve => {
    const spark = new SparkMD5.ArrayBuffer();
    let count = 0;
    const loadNext = (index: number) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(chunks[index].file);
      reader.onload = e => {
        // 累加器 不能依赖index，
        count++;
        // 增量计算md5
        spark.append(e.target?.result as ArrayBuffer);
        if (count === chunks.length) {
          // 通知主线程，计算结束
          hashProgress = 100;
          resolve({ hashValue: spark.end(), progress: hashProgress });
        } else {
          // 每个区块计算结束，通知进度即可
          hashProgress += 100 / chunks.length
          // 计算下一个
          loadNext(count);
        }
      };
    };
    // 启动
    loadNext(0);
  });
}

/**
 * 通过时间片的方式来计算hash值
 * @param file {File}
 * @returns 
 */
export async function calcHashByIdle(file: File) {
  const size = 2 * 1024 * 1024;
  let chunks: any[] = [];
  let cur = 0;
  while (cur < file.size) {
    chunks.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }
  const spark = new SparkMD5.ArrayBuffer();
  let hashProgress = 0

  return new Promise(resolve => {

    let count = 0;
    const appendToSpark = async (file: File) => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = e => {
          spark.append(e.target?.result as ArrayBuffer);
          resolve(1);
        };
      });
    };
    const workLoop = async (deadline: IdleDeadline) => {
      // 有任务，并且当前帧还没结束
      while (count < chunks.length && deadline.timeRemaining() > 1) {
        await appendToSpark(chunks[count].file);
        count++;
        // 没有了 计算完毕
        if (count < chunks.length) {
          // 计算中
          hashProgress = Number(
            ((100 * count) / chunks.length).toFixed(2)
          );
        } else {
          // 计算完毕
          hashProgress = 100;
          resolve({ hashValue: spark.end(), progress: hashProgress });
        }
      }
      window.requestIdleCallback(workLoop);
    };
    window.requestIdleCallback(workLoop);
  });
}

