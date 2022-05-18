
self.importScripts('./spark-md5.js');

self.onmessage = (event) => {
  const fileChunkList = event.data.chunks
  const spark = new (self as any).SparkMD5();
  let percentage = 0;
  let count = 0;
  const loadNext = (index: number) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(fileChunkList[index].file);
    reader.onload = (e) => {
      count++;
      spark.append(e.target?.result as ArrayBuffer);
      if (count === fileChunkList.length) {
        self.postMessage({
          progress: 100,
          hash: spark.end(),
        });
        self.close();
      } else {
        percentage += 100 / fileChunkList.length;
        self.postMessage({
          progress:percentage,
        });
        // 递归计算下一个切片
        loadNext(count);
      }
    };
  };
  loadNext(0);
}
