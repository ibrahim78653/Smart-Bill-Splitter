/** Zustand store for bill session state. */
import { create } from 'zustand'

export type WorkflowStage =
  | 'UPLOAD'
  | 'IMAGE_PREPROCESSING'
  | 'EXTRACTION'
  | 'VALIDATION'
  | 'AI_VERIFICATION'
  | 'HUMAN_REVIEW'
  | 'PEOPLE_SETUP'
  | 'ASSIGNMENT'
  | 'ASSIGNMENT_VALIDATION'
  | 'DETERMINISTIC_CALCULATION'
  | 'RECONCILIATION'
  | 'RESULT'

export interface LineItem {
  id: string
  name: string
  quantity: string
  unit_price: string | null
  line_total: string | null
  category: string | null
  confidence: Record<string, 'high' | 'medium' | 'low'>
  warnings: string[]
  user_edited: boolean
}

export interface Tax {
  name: string
  rate: string | null
  amount: string
  confidence: string
}

export interface Bill {
  bill_id: string
  merchant_name: string | null
  bill_number: string | null
  bill_date: string | null
  currency: string
  line_items: LineItem[]
  subtotal_printed: string | null
  subtotal_calculated: string
  discount: string
  service_charge: string
  taxes: Tax[]
  total_printed: string | null
  total_calculated: string
  reconciles: boolean
  reconciliation_diff: string | null
  verification_status: 'pending' | 'needs_review' | 'confirmed'
  workflow_stage: WorkflowStage
  warnings: string[]
  source_images: string[]
  created_at: string
}

export interface Person {
  id: string
  name: string
}

export interface PersonAllocation {
  person_id: string
  quantity: string
}

export interface Assignment {
  line_item_id: string
  allocations: PersonAllocation[]
}

interface BillStore {
  // Current bill
  bill: Bill | null
  setBill: (bill: Bill | null) => void

  // People
  people: Person[]
  setPeople: (people: Person[]) => void

  // Assignments
  assignments: Assignment[]
  setAssignments: (assignments: Assignment[]) => void
  updateAssignment: (lineItemId: string, allocations: PersonAllocation[]) => void

  // UI state
  isProcessing: boolean
  setIsProcessing: (v: boolean) => void
  processingStep: string
  setProcessingStep: (step: string) => void

  // Reset
  reset: () => void
}

export const useBillStore = create<BillStore>((set) => ({
  bill: null,
  setBill: (bill) => set({ bill }),

  people: [],
  setPeople: (people) => set({ people }),

  assignments: [],
  setAssignments: (assignments) => set({ assignments }),
  updateAssignment: (lineItemId, allocations) =>
    set((state) => {
      const existing = state.assignments.find((a) => a.line_item_id === lineItemId)
      if (existing) {
        return {
          assignments: state.assignments.map((a) =>
            a.line_item_id === lineItemId ? { ...a, allocations } : a
          ),
        }
      }
      return {
        assignments: [...state.assignments, { line_item_id: lineItemId, allocations }],
      }
    }),

  isProcessing: false,
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  processingStep: '',
  setProcessingStep: (processingStep) => set({ processingStep }),

  reset: () =>
    set({
      bill: null,
      people: [],
      assignments: [],
      isProcessing: false,
      processingStep: '',
    }),
}))
