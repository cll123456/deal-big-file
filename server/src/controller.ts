import path from 'path'
import fse from 'fs-extra'
import { resolvePost, pipeStream, extractExt, getUploadedList, mergeFiles, sleep, resolveGet } from './util'
import multiparty from 'multiparty'
import http from 'http'
import { UrlWithParsedQuery } from 'url'

export default class Controller {
  /**
   * 上传的目录
   */
  UPLOAD_DIR: string
  constructor(uploadDir: string) {
    this.UPLOAD_DIR = uploadDir
  }

  /**
   * 合并文件
   * @param filePath 
   * @param fileHash 
   * @param size 
   */
  async mergeFileChunk(filePath: string, fileHash: string, size: number[]) {
    // cpmspe/pg)
    const chunkDir = path.resolve(this.UPLOAD_DIR, fileHash)
    await sleep(10)
    let chunkPaths = await fse.readdir(chunkDir)
    // 根据切片下标进行排序
    // 否则直接读取目录的获得的顺序可能会错乱
    // xxxx-0
    chunkPaths
      .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))
    chunkPaths = chunkPaths.map(cp => path.resolve(chunkDir, cp)) // 转成文件路径
    await mergeFiles(chunkPaths, filePath, size)
  }

  /**
   * 验证文件是否存在
   * @param req 
   * @param res 
   */
  async handleVerify(req: http.IncomingMessage, res: http.ServerResponse) {
    const data = await resolvePost(req) as { filename: string, hash: string }
    const { filename, hash } = data
    // 获取文件后缀名称
    const ext = extractExt(filename)
    const filePath = path.resolve(this.UPLOAD_DIR, `${hash}${ext}`)

    // 文件是否存在
    let uploaded = false
    let uploadedList: string[] = []
    if (fse.existsSync(filePath)) {
      uploaded = true
    } else {
      // 文件没有完全上传完毕，但是可能存在部分切片上传完毕了
      uploadedList = await getUploadedList(path.resolve(this.UPLOAD_DIR, hash))
    }
    res.end(
      JSON.stringify({
        code: 200,
        uploaded,
        uploadedList // 过滤诡异的隐藏文件
      })
    )

  }

  /**
   * 处理文件合并
   * @param req 
   * @param res 
   */
  async handleMerge(req: http.IncomingMessage, res: http.ServerResponse) {
    const data = await resolvePost(req)
    const { fileHash, filename, size } = data as { fileHash: string, filename: string, size: number[] }
    const ext = extractExt(filename)
    const filePath = path.resolve(this.UPLOAD_DIR, `${fileHash}${ext}`)
    await this.mergeFileChunk(filePath, fileHash, size)
    // 合并后删除空目录
    const chunkDir = path.resolve(this.UPLOAD_DIR, fileHash)
    fse.rmdirSync(chunkDir);

    res.end(
      JSON.stringify({
        code: 200,
        message: "file merged success"
      })
    )
  }

  /**
   * 文件上传
   * @param req 
   * @param res 
   */
  async handleUpload(req: http.IncomingMessage, res: http.ServerResponse) {
    // 解析请求
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, field, file) => {
      // 存在报错
      if (err) {
        console.log(err)
        return
      }
      // 解构数据
      const [chunk] = file.chunk
      const [hash] = field.hash
      const [filename] = field.filename
      const [fileHash] = field.fileHash
      // 文件路径
      const filePath = path.resolve(
        this.UPLOAD_DIR,
        `${fileHash}${extractExt(filename)}`
      )
      const chunkDir = path.resolve(this.UPLOAD_DIR, fileHash)
      //todo 假设文件上传失败
      // if (Math.random() < 0.5) {
      //   // 概率报错
      //   console.log('概率报错了')
      //   res.end(JSON.stringify({
      //     code: 500,
      //     message: "upload failed"
      //   }))
      //   return
      // }

      // 文件存在直接返回
      if (fse.existsSync(filePath)) {
        res.end(JSON.stringify({
          code: 200,
          message: "file is exits"
        }))
        return
      }
      // 不存在文件夹则创建
      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir)
      }
      // 移动文件
      await fse.move(chunk.path, `${chunkDir}/${hash}`)
      // res.end("received file chunk")
      res.end(
        JSON.stringify({
          code: 200,
          message: "received file chunk"
        })
      )
    })
  }

  /**
   * 获取文件的大小,用于分片下载
   * @param req 
   * @param res 
   */
  async getFileSize(req: http.IncomingMessage, res: http.ServerResponse) {
    // 获取文件名称
    const resp: UrlWithParsedQuery = await resolveGet(req)
    const filePath = path.resolve(this.UPLOAD_DIR, resp.query.filename as string)
    // 判断文件是否存在
    if (fse.existsSync(filePath)) {
      // 返回文件的大小
      const size = fse.statSync(filePath).size
      res.end(JSON.stringify({
        code: 200,
        size,
      }))
    } else {
      res.end(JSON.stringify({
        code: 500,
        message: "file not exits"
      }))
    }

  }
  /**
   * 文件下载
   * @param req  
   * @param res 
   */
  async handleDownload(req: http.IncomingMessage, res: http.ServerResponse) {
    // 获取文件名称
    const resp: UrlWithParsedQuery = await resolveGet(req)
    const filePath = path.resolve(this.UPLOAD_DIR, resp.query.filename as string)
    // 判断文件是否存在
    if (fse.existsSync(filePath)) {
      // 创建流来读取文件并下载
      const stream = fse.createReadStream(filePath)
      // 写入文件
      stream.pipe(res)
    }
  }
}
