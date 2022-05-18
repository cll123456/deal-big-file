import path from 'path'
import fse from 'fs-extra'
import http from 'http'
import { WriteStream, } from 'fs'

/**
 * 解析post的数据
 * @param req 
 * @returns 
 */
export function resolvePost(req: http.IncomingMessage) {
  return new Promise(resolve => {
    let chunk = ""
    req.on("data", data => {
      chunk += data
    })
    req.on("end", () => {
      resolve(JSON.parse(chunk))
    })
  })
}

/**
 * 管道写入文件
 * @param filePath 
 * @param writeStream 
 * @returns 
 */
export const pipeStream = (filePath: string, writeStream: WriteStream) =>
  new Promise(resolve => {
    const readStream = fse.createReadStream(filePath)
    readStream.on("end", () => {
      // 删除文件
      fse.unlinkSync(filePath)
      resolve(true)
    })
    readStream.pipe(writeStream)
  })

/**
 * 合并文件
 * @param files 
 * @param dest 
 * @param size 
 */
export async function mergeFiles(files: string[], dest: string, size: number[]) {
  await Promise.all(files.map(async (file, index) => {
    let sizes = 0;
    size.forEach((s, i) => {
      if (i <= index) {
        sizes += s
      }
    })
    return pipeStream(
      file,
      // 指定位置创建可写流 加一个put避免文件夹和文件重名
      // hash后不存在这个问题，因为文件夹没有后缀
      // fse.createWriteStream(path.resolve(dest, '../', 'out' + filename), {
      fse.createWriteStream(dest, {
        start: sizes,
      })
    )
  }))
}



/**
 * 返回已经上传切片名列表
 * @param dirPath 
 * @returns 
 */
export async function getUploadedList(dirPath: string) {
  return fse.existsSync(dirPath)
    ? (await fse.readdir(dirPath)).filter(name => name[0] !== '.') // 过滤诡异的隐藏文件
    : []
}

/**
 * 获取文件的拓展命
 * @param filename 
 * @returns 
 */
export function extractExt(filename: string) {
  return filename.slice(filename.lastIndexOf("."), filename.length)
}


/**
 * 休眠多久
 * @param ms 
 * @returns 
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms * 1000))


// function sendRequest(urls, max, callback) {
//   const len = urls.length;
//   let idx = 0;
//   let counter = 0;

//   async function start() {
//     // 有请求，有通道
//     while (idx < len && max > 0) {
//       max--; // 占用通道
//       console.log(urls[idx], 'start')
//       sleep(urls[idx++]).then(() => {
//         max++; // 释放通道
//         counter++;
//         if (counter === len) {
//           return callback();
//         } else {
//           start();
//         }

//       })

//     }
//   }
//   start();
// }






