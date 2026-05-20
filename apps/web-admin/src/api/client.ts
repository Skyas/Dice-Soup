/**
 * @module api/client
 * 统一 HTTP 请求工具。自动注入 JWT token，统一错误处理。
 */

import { useAuthStore } from '@/stores/auth'

interface RequestOptions {
  noAuth?: boolean
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (!options.noAuth) {
    // 直接从 localStorage 读（避免循环依赖 pinia store）
    const token = localStorage.getItem('admin_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    // Token 过期：清除本地状态，跳转登录
    localStorage.removeItem('admin_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'UNKNOWN', data.message ?? '请求失败')
  }

  return data as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const apiGet = <T>(url: string, options?: RequestOptions) =>
  request<T>('GET', url, undefined, options)

export const apiPost = <T>(url: string, body: unknown, options?: RequestOptions) =>
  request<T>('POST', url, body, options)

export const apiPut = <T>(url: string, body: unknown, options?: RequestOptions) =>
  request<T>('PUT', url, body, options)

export const apiDelete = <T>(url: string, options?: RequestOptions) =>
  request<T>('DELETE', url, undefined, options)
