/**
 * 回归测试：跨域 Worker 的 blob URL 在构造后必须 revoke，避免泄漏；同源不走 blob、不 revoke。
 * https://github.com/jd-opensource/micro-app W1-5
 */
/* eslint-disable @typescript-eslint/no-empty-function */

// worker.ts 在模块加载时读取 window.Worker（const originalWorker = window.Worker），
// jsdom 无 Worker，须在 import 前垫上，否则 new Proxy(undefined) 直接抛错。
class FakeWorker {
  url: string | URL
  options: any
  constructor (url: string | URL, options?: any) {
    this.url = url
    this.options = options
  }

  postMessage (): void {}
  terminate (): void {}
  addEventListener (): void {}
  removeEventListener (): void {}
  dispatchEvent (): boolean { return true }
}

// mock 依赖：getCurrentAppName 返回 null，走"无 appName"路径，避免依赖 appInstanceMap
jest.mock('../../create_app', () => ({ appInstanceMap: new Map() }))
jest.mock('../../libs/utils', () => ({
  getCurrentAppName: () => null,
  CompletionPath: (url: string) => url,
}))

describe('proxies/worker blob url revoke (W1-5)', () => {
  let createSpy: jest.SpyInstance
  let revokeSpy: jest.SpyInstance
  let WorkerProxy: any

  beforeAll(() => {
    // @ts-ignore
    window.Worker = FakeWorker as any
    // @ts-ignore
    window.URL.createObjectURL = () => 'blob:mock-worker-url'
    // @ts-ignore
    window.URL.revokeObjectURL = () => {}
    createSpy = jest.spyOn(window.URL, 'createObjectURL')
    revokeSpy = jest.spyOn(window.URL, 'revokeObjectURL')
    // 在垫好 window.Worker 之后再 require，确保 originalWorker 拿到 FakeWorker
    WorkerProxy = require('../../proxies/worker').default
  })

  beforeEach(() => {
    createSpy.mockClear()
    revokeSpy.mockClear()
  })

  test('cross-origin worker: blob url created then revoked (no leak)', () => {
    const instance = new WorkerProxy('https://other-origin.example.com/w.js')
    // 跨域走 blob 路径：createObjectURL 被调一次
    expect(createSpy).toHaveBeenCalledTimes(1)
    // 关键：构造后立即 revoke，且 revoke 的正是那个 blob url
    expect(revokeSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-worker-url')
    // worker 实例正常返回（revoke 不影响构造）
    expect(instance).toBeInstanceOf(FakeWorker)
  })

  test('same-origin worker: no blob, no revoke', () => {
    const sameOrigin = window.location.origin + '/w.js'
    const instance = new WorkerProxy(sameOrigin)
    expect(createSpy).not.toHaveBeenCalled()
    expect(revokeSpy).not.toHaveBeenCalled()
    expect(instance).toBeInstanceOf(FakeWorker)
  })
})
