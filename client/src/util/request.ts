const baseUrl = 'http://localhost:4001'
interface IRequest {
    url: string,
    method?: string,
    data: Document | XMLHttpRequestBodyInit | null | undefined,
    onProgress?: ((e: ProgressEvent) => void) | undefined,
    headers?: { [key: string]: string }
    requestList?: XMLHttpRequest[] | undefined
}

export function request({
    url,
    method = "post",
    data,
    onProgress = e => e,
    headers = {},
    requestList
}: IRequest) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = onProgress
        xhr.open(method, baseUrl + url);
        Object.keys(headers).forEach(key =>
            xhr.setRequestHeader(key, headers[key])
        );
        xhr.send(data);

        xhr.onreadystatechange = e => {
            if (xhr.readyState === 4) {
                // console.log(xhr, 'xhr.status')
                if (xhr.status === 200) {
                    if (requestList) {
                        // 成功后删除列表
                        const i = requestList.findIndex(req => req === xhr)
                        requestList.splice(i, 1)
                    }
                    // 获取服务响应的结构
                    const resp = JSON.parse(xhr.response);
                    if (resp.code === 200) {
                        // 成功操作
                        resolve({
                            data: (e.target as any)?.response
                        });
                    } else {
                        reject('报错了 大哥')
                    }

                } else if (xhr.status === 500) {
                    reject('报错了 大哥')
                }
            }
        };
        // 存储 在vue中的this.requestList中
        requestList?.push(xhr)
    });
}
export async function post(url: string, data: Document | XMLHttpRequestBodyInit | null | undefined | { [key: string]: any }) {
    let ret = await request({
        url,
        data: JSON.stringify(data),
        headers: {
            "content-type": "application/json"
        }
    }) as { data: any }
    return JSON.parse(ret.data)
}
