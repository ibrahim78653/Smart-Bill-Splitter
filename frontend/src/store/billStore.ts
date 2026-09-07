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

/** Per-person split result (mirrors backend PersonResult shape we need) */
export interface SplitResultEntry {
  person_id: string
  name: string
  food_subtotal: string
  tax_share: string
  total: string
  line_breakdown: Array<{
    item_name: string
    allocated_quantity: string
    line_total_share: string
    provenance: string
  }>
  tax_breakdown: Array<[string, string]>
  service_charge_share: string
  discount_share: string
  rounding_adjustment: string
}

interface BillStore {
  // Current bill
  bill: Bill | null
  setBill: (bill: Bill | null) => void

  // Image URL (for Step 1 preview)
  imageUrl: string | null
  setImageUrl: (url: string | null) => void

  // People
  people: Person[]
  setPeople: (people: Person[]) => void

  // Legacy assignments (for API compatibility)
  assignments: Assignment[]
  setAssignments: (assignments: Assignment[]) => void
  updateAssignment: (lineItemId: string, allocations: PersonAllocation[]) => void

  // Wizard-style assignments: itemId → [personId, ...]
  wizardAssignments: Record<string, string[]>
  setWizardAssignments: (a: Record<string, string[]>) => void
  setItemAssignees: (itemId: string, personIds: string[]) => void

  // Final split result (from backend)
  splitResult: SplitResultEntry[]
  setSplitResult: (result: SplitResultEntry[]) => void

  // Wizard step (1–4)
  currentStep: 1 | 2 | 3 | 4
  setCurrentStep: (step: 1 | 2 | 3 | 4) => void

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

  imageUrl: null,
  setImageUrl: (imageUrl) => set({ imageUrl }),

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

  wizardAssignments: {},
  setWizardAssignments: (wizardAssignments) => set({ wizardAssignments }),
  setItemAssignees: (itemId, personIds) =>
    set((state) => ({
      wizardAssignments: { ...state.wizardAssignments, [itemId]: personIds },
    })),

  splitResult: [],
  setSplitResult: (splitResult) => set({ splitResult }),

  currentStep: 1,
  setCurrentStep: (currentStep) => set({ currentStep }),

  isProcessing: false,
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  processingStep: '',
  setProcessingStep: (processingStep) => set({ processingStep }),

  reset: () =>
    set({
      bill: null,
      imageUrl: null,
      people: [],
      assignments: [],
      wizardAssignments: {},
      splitResult: [],
      currentStep: 1,
      isProcessing: false,
      processingStep: '',
    }),
}))
