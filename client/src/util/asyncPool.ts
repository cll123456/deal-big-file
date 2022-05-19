/**
 * 异步控制池 - 异步控制器
 * @param concurrency 最大并发次数
 * @param iterable  异步控制的函数的参数
 * @param iteratorFn 异步控制的函数
 */
export async function* asyncPool<IN, OUT>(concurrency: number, iterable: ReadonlyArray<IN>, iteratorFn: (item: IN, iterable?: ReadonlyArray<IN>) => Promise<OUT>): AsyncIterableIterator<OUT> {
  const executing = new Set<Promise<IN>>();
  async function consume() {
    const [promise, value] = await Promise.race(executing) as unknown as [Promise<IN>, OUT];
    executing.delete(promise);
    return value;
  }
  for (const item of iterable) {
    // Wrap iteratorFn() in an async fn to ensure we get a promise.
    // Then expose such promise, so it's possible to later reference and
    // remove it from the executing pool.
    const promise = (async () => await iteratorFn(item, iterable))().then(
      value => [promise, value]
    ) as Promise<IN>;
    executing.add(promise);
    if (executing.size >= concurrency) {
      yield await consume();
    }
  }
  while (executing.size) {
    yield await consume();
  }
}


