import http from 'http'
import path from 'path'
import Controller from './controller'
const server = http.createServer()

interface httpServerResponse extends http.ServerResponse {
  /**
   * 状态码  
   */
  status: number,
  /**
   * 消息
   */
  msg?: string
}
// 文件存储的目录
const ctrl = new Controller(path.resolve(__dirname, '../target'))
/**
 * 监听请求
 */
server.on("request", async (req, res: httpServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "*")
  // 请求预检
  if (req.method === "OPTIONS") {
    res.status = 200
    res.end()
    return
  }
  if (req.url === "/") {
    res.status = 200
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="ie=edge">
          <title>Document</title>
      </head>
      <body>
          <h1>Hello World</h1>
      </body>
      </html>
    `)
    return
  }
  if (req.method === "POST") {
    if (req.url == '/upload') {
      await ctrl.handleUpload(req, res)
      return
    }
    if (req.url == '/merge') {
      await ctrl.handleMerge(req, res)
      return
    }
    if (req.url == '/verify') {
      await ctrl.handleVerify(req, res)
      return
    }
    if (req.url === '/download') {
      await ctrl.handleDownload(req, res)
      return
    }

  }
  if (req.method === "GET") {
    if (req.url?.indexOf('/download') === 0) {
      await ctrl.handleDownload(req, res)
      return
    }
  }
})
server.listen(4001, () => console.log("正在监听 4001 端口"))
