<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://vuejs.org/api/sfc-script-setup.html#script-setup
import { computed, ref, Ref } from 'vue'
import SparkMD5 from "spark-md5"
import { calcHashByWebWorker, calcHashSampleByWebWorker, calcHashSample, calcHashByIdle, calcHashSync } from './util/calcFileHash';
import { get, post, request } from './util/request';
import streamSaver from 'streamsaver'
/**
 * 上传状态枚举
 */
enum Status {
  wait = "wait",
  pause = "pause",
  uploading = "uploading",
  error = "error",
  done = "done",
}

const fileList: Ref<File | null> = ref(null)
const fileHash = ref('')

const chunksMap = ref<chunksMap[]>([])
const requestList = ref<XMLHttpRequest[]>([])
// 文件的状态
const status = ref(Status.wait)

const uploadedList = ref([])

/**
 * 选择文件
 * @param e 
 */
const handleFileChange = async (e: Event) => {
  const files = (e.target as HTMLInputElement)?.files as FileList;
  if (!files.length) return;
  fileList.value = files[0];
  status.value = Status.wait;


  console.time("calcHashSample")
  const res = await calcHashSample(fileList.value);
  console.timeEnd("calcHashSample");
  console.log("calcHashSample抽样计算hash" + fileList.value.name, res);



  // console.time("calcHashSync")
  // const hash5 = await calcHashSync(fileList.value);
  // console.timeEnd("calcHashSync");
  // console.log("calcHashSync 全量计算hash" + fileList.value.name, hash5);

  // console.time("calcHashByIdle")
  // const hash2 = await calcHashByIdle(fileList.value);
  // console.timeEnd("calcHashByIdle");
  // console.log("calcHashByIdle浏览器空余时间全量计算hash" + fileList.value.name, hash2);


  // console.time("calcHashByWebWorker")
  // const hash3 = await calcHashByWebWorker(fileList.value)
  // console.timeEnd("calcHashByWebWorker");
  // console.log("calcHashByWebWorker web-worker全量计算hash" + fileList.value.name, hash3);

  // console.time("calcHashSampleByWebWorker")
  // const hash4 = await calcHashSampleByWebWorker(fileList.value)
  // console.timeEnd("calcHashSampleByWebWorker");
  // console.log("calcHashSampleByWebWorker 抽样web-work计算hash" + fileList.value.name, hash4);

}

/**
 * 生成chunks
 * @param file {File} 文件
 * @param size {Number} 每一个chunks的大小
 */
const createFileChunk = (file: File, size = 2 * 1024 * 1024) => {
  // 生成文件块
  const chunks = [];
  let cur = 0;
  while (cur < file.size) {
    chunks.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }
  return chunks;
}
/**
 * 验证文件是否存在
 * @param filename {string} 文件名
 * @param hash {string} 文件hash名称
 */
const verify = async (filename: string, hash: string) => {
  const data = await post("/verify", { filename, hash });
  return data;
}

interface chunksMap {
  /**
   * 文件hash名称
   */
  fileHash: string;
  /**
   * 每一个chunks
   */
  chunk: Blob;
  /**
   * 索引
   */
  index: number;
  /**
   * 整个文件的hash名称
   */
  hash: string;
  /**
   * 进度
   */
  progress: number;
  /**
   * 文件大小
   */
  size: number;
}

/**
 * 上传
 */
const upload = async () => {
  const file = fileList.value;
  if (!file) return;
  // 生成chunks
  const chunks = createFileChunk(file);
  // 计算文件hash
  const obj = await calcHashSample(file) as { hashValue: string };
  fileHash.value = obj.hashValue;
  // 判断文件是否存在,如果不存在，获取已经上传的切片
  const { uploaded, uploadedList } = await verify(
    file.name,
    obj.hashValue
  );
  uploadedList.value = uploadedList;
  // 判断文件是否存在,如果不存在，获取已经上传的切片
  if (uploaded) {
    status.value = Status.done;
    return alert("秒传:上传成功");
  }
  chunksMap.value = chunks.map((chunk, index) => {
    const chunkName = obj.hashValue + "-" + index;
    return {
      fileHash: obj.hashValue,
      chunk: chunk.file,
      index,
      hash: chunkName,
      progress: uploadedList.indexOf(chunkName) > -1 ? 100 : 0,
      size: chunk.file.size
    };
  })

  // 传入已经存在的切片清单
  await uploadChunks(chunksMap.value, uploadedList.value);
}

interface ISendReq {
  /**
   * 表单数据
   */
  form: FormData;
  /**
   * 索引
   */
  index: number;
  /**
   * 文件状态
   */
  status: Status;
  /**
   * 是否完成
   */
  done?: boolean;
}

/**
 * 上传切片
 */
const uploadChunks = async (chunkMap: chunksMap[], uploadedList: string[] = []) => {
  // 这里一起上传，碰见大文件就是灾难
  // 异步并发控制策略
  // 比如并发量控制成4
  const list = chunkMap.filter(chunk => uploadedList.indexOf(chunk.hash) == -1)
    .map(({ chunk, hash, index }, i) => {
      const form = new FormData();
      form.append("chunk", chunk);
      form.append("hash", hash);
      form.append("filename", fileList.value!.name);
      form.append("fileHash", fileHash.value);
      return { form, index, status: Status.wait };
    })
  try {
    status.value = Status.uploading;
    const ret = await sendRequest(list, 4)
    if (ret && uploadedList.length + list.length === chunksMap.value.length) {
      // 上传和已经存在之和 等于全部的再合并
      const chunksSize = new Array(chunksMap.value.length).fill(2 * 1024 * 1024)
      chunksSize[0] = 0
      await mergeRequest(chunksSize);
      status.value = Status.done;
    }
  } catch (e) {
    // alert('亲 上传失败了,考虑重试下呦');
    status.value = Status.error;
    console.log(e, '------错误文件')
  }
}

/**
 * 发送上传文件请求
 * @param urls 请求
 * @param max  最大请求通道
 * @param retryTimes  重试次数
 */
const sendRequest = async (urls: ISendReq[], max = 4, retryTimes = 3) => {
  return new Promise((resolve, reject) => {
    const len = urls.length;
    let counter = 0;
    const retryArr: number[] = new Array(len).fill(0);
    const start = async () => {
      if (counter === len && counter === 0) {
        resolve(true)
      }
      // 有请求，有通道
      while (counter < len && max > 0) {
        max--; // 占用通道
        // 等待或者error 需要重传
        const i = urls.findIndex(v => v.status == Status.wait || v.status == Status.error)
        if (i == -1) {
          // 没有等待的请求，结束
          resolve(true);
          return;
        }
        urls[i].status = Status.uploading

        const form = urls[i].form;
        const index = urls[i].index;
        if (typeof retryArr[index] == 'number') {
          console.log(index, `第${retryArr[index] + 1}次上传`)
        }
        request({
          url: '/upload',
          data: form,
          onProgress: createProgresshandler(chunksMap.value[index]),
          requestList: requestList.value
        }).then(() => {
          urls[i].status = Status.done
          max++; // 释放通道
          counter++;
          // urls[counter].done = true
          if (counter === len) {
            resolve(true);
          } else {
            start();
          }
        }).catch((e) => {
          // 初始值
          urls[i].status = Status.error
          if (typeof retryArr[index] !== 'number') {
            retryArr[index] = 0
          }
          // 次数累加
          retryArr[index]++
          // 一个请求报错3次的
          if (retryArr[index] > retryTimes) {
            return reject() // 考虑abort所有别的
          }
          console.log(index, retryArr[index], e, '次报错')
          // 3次报错以内的 重启
          chunksMap.value[index].progress = -1 // 报错的进度条
          max++; // 释放当前占用的通道，但是counter不累加

          start()
        })
      }
    }

    start();

  });
}


/**
 * 创建上传进度
 * @param item 
 */
const createProgresshandler = (item: chunksMap) => {
  return (e: ProgressEvent) => {
    item.progress = parseInt(String((e.loaded / e.total) * 100));
  };
}

/**
 * 发送合并请求
 */
const mergeRequest = async (chunkSize: number[]) => {
  await post("/merge", {
    filename: fileList.value?.name,
    size: chunkSize,
    fileHash: fileHash.value
  });
}
/**
 * 暂停上传
 */
const handlePause = () => {
  status.value = Status.pause;
  // 暂停所有请求
  requestList.value.forEach(xhr => xhr?.abort());
  requestList.value = [];
}

/**
 * 恢复上传
 */
const handleResume = async () => {
  status.value = Status.uploading;
  const { uploadedList } = await verify(
    fileList.value!.name,
    fileHash.value,
  );
  // 上传切片
  await uploadChunks(chunksMap.value, uploadedList);
}

const format = (num: number) => {
  if (num > 1024 * 1024 * 1024) {
    return (num / (1024 * 1024 * 1024)).toFixed(2) + 'GB'
  }
  if (num > 1024 * 1024) {
    return (num / (1024 * 1024)).toFixed(2) + 'MB'
  }
  if (num > 1024) {
    return (num / (1024)).toFixed(2) + 'KB'
  }
  return num + 'B'
}
/**
 * 根据当前网速大小来分割切片
 */
const handleUpload1 = async () => {
  // @todo数据缩放的比率 可以更平缓  
  // @todo 并发+慢启动
  // 慢启动上传逻辑 
  const file = fileList.value
  if (!file) return;
  status.value = Status.uploading;
  const fileSize = file.size
  let offset = 2 * 1024 * 1024
  let cur = 0
  let count = 0
  const chunksSize = [0, 2 * 1024 * 1024]
  const obj = await calcHashSample(file) as { hashValue: string };
  fileHash.value = obj.hashValue;
  // 判断文件是否存在,如果不存在，获取已经上传的切片
  const { uploaded, uploadedList } = await verify(
    file.name,
    obj.hashValue
  );
  // 判断文件是否存在,如果不存在，获取已经上传的切片
  if (uploaded) {
    status.value = Status.done;
    return alert("秒传:上传成功");
  }
  while (cur < fileSize) {
    const chunk = file.slice(cur, cur + offset)
    cur += offset
    const chunkName = fileHash.value + "-" + count;
    const form = new FormData();
    form.append("chunk", chunk);
    form.append("hash", chunkName);
    form.append("filename", file.name);
    form.append("fileHash", fileHash.value);
    form.append("size", chunk.size.toString());
    let start = new Date().getTime()
    await request({ url: '/upload', data: form })
    const now = new Date().getTime()
    const time = ((now - start) / 1000).toFixed(4)
    let rate = Number(time) / 10
    // 速率有最大和最小 可以考虑更平滑的过滤 比如1/tan 
    if (rate < 0.5) rate = 0.5
    if (rate > 2) rate = 2
    // 新的切片大小等比变化
    console.log(`切片${count}大小是${format(offset)},耗时${time}秒，是10秒的${rate}倍，修正大小为${format(offset / rate)}`)
    offset = parseInt((offset / rate).toString())
    chunksSize.push(offset)
    count++
  }
  // 可以发送合并操作了
  await mergeRequest(chunksSize)
}

/**
 * 每一个方块的长度
 */
const cubeWidth = computed(() => {
  return Math.ceil(Math.sqrt(chunksMap.value.length)) * 16
})

const downloadFile = async () => {
  // StreamSaver

  const url = 'http://localhost:4001/download?filename=b0d9a1481fc2b815eb7dbf78f2146855.zip'
  const fileStream = streamSaver.createWriteStream('b0d9a1481fc2b815eb7dbf78f2146855.zip')
  // 发送请求下载
  fetch(url).then(res => {
    const readableStream = res.body

    // more optimized
    if (window.WritableStream && readableStream?.pipeTo) {
      return readableStream.pipeTo(fileStream)
        .then(() => console.log('done writing'))
    }

    const writer = fileStream.getWriter()

    const reader = res.body?.getReader()
    const pump: any = () => reader?.read()
      .then(res => res.done
        ? writer.close()
        : writer.write(res.value).then(pump))

    pump()
  })
}

</script>

<template>
  <input type="file" @change="handleFileChange" />
  <button @click="handleUpload1">按照网速实时分片上传</button>
  <button @click="upload">直接把文件分为等分的片上传</button>
  <button @click="handlePause">暂停上传</button>
  <button @click="handleResume">恢复上传</button>
  <div>状态： {{ status }}</div>
  <div>等分进度进度</div>
  <div class="cube-container" :style="{ width: cubeWidth + 'px' }">
    <div class="cube" v-for="chunk in chunksMap" :key="chunk.hash">
      <div :class="{
        'uploading': chunk.progress > 0 && chunk.progress < 100,
        'success': chunk.progress == 100,
        'error': chunk.progress < 0,
      }" :style="{ height: chunk.progress + '%' }">
        {{ chunk.index }}
      </div>
    </div>
  </div>

  <div>
    <button @click="downloadFile">用流下载文件</button>
  </div>
</template>

<style>
.cube-container {
  width: 100px;
  overflow: hidden
}

.cube {
  width: 14px;
  height: 14px;
  line-height: 12px;
  border: 1px solid black;
  background: #eee;
  float: left
}

.cube .success {
  background: #67C23A
}

.cube .uploading {
  background: #409EFF
}

.cube .error {
  background: #F56C6C
}
</style>
