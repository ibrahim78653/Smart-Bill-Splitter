/** API client — all requests go through here. Zero financial arithmetic in frontend. */
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.PROD ? '' : 'http://localhost:8000')

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.message || 'Something went wrong. Please try again.'
    return Promise.reject(new Error(message))
  }
)

// ── Bills ─────────────────────────────────────────────────────────────────────

export const uploadBill = async (files: File[]) => {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  const res = await api.post('/api/bills/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data as { bill_id: string; image_count: number; status: string }
}

export const extractBill = async (billId: string) => {
  const res = await api.post(`/api/bills/${billId}/extract`)
  return res.data
}

export const verifyBill = async (billId: string) => {
  const res = await api.post(`/api/bills/${billId}/verify`)
  return res.data
}

export const getBill = async (billId: string) => {
  const res = await api.get(`/api/bills/${billId}`)
  return res.data
}

export const updateBill = async (billId: string, updates: Record<string, unknown>) => {
  const res = await api.put(`/api/bills/${billId}`, updates)
  return res.data
}

export const confirmBill = async (billId: string) => {
  const res = await api.post(`/api/bills/${billId}/confirm`)
  return res.data
}

// ── People ────────────────────────────────────────────────────────────────────

export const savePeople = async (billId: string, people: Array<{ id?: string; name: string }>) => {
  const res = await api.post(`/api/bills/${billId}/people`, { people })
  return res.data
}

export const getPeople = async (billId: string) => {
  const res = await api.get(`/api/bills/${billId}/people`)
  return res.data
}

// ── Assignments ───────────────────────────────────────────────────────────────

export const saveAssignments = async (billId: string, assignments: unknown[]) => {
  const res = await api.post(`/api/bills/${billId}/assignments`, { assignments })
  return res.data
}

export const getAssignments = async (billId: string) => {
  const res = await api.get(`/api/bills/${billId}/assignments`)
  return res.data
}

export const parseNLAssignment = async (billId: string, instruction: string) => {
  const res = await api.post(`/api/bills/${billId}/assignments/parse`, { instruction })
  return res.data
}

// ── Calculation ───────────────────────────────────────────────────────────────

export const calculateBill = async (billId: string) => {
  const res = await api.post(`/api/bills/${billId}/calculate`)
  return res.data
}

export const getResult = async (billId: string) => {
  const res = await api.get(`/api/bills/${billId}/result`)
  return res.data
}
