'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  Loader2,
  User,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { colors } from '@/types'

interface UserItem {
  id: string
  email: string
  first_name?: string
  last_name?: string
  username?: string
  accounts?: AccountItem[]
}

interface AccountItem {
  id: string
  account_number: string
  account_type: string
  currency: string
  balance: number
}

interface CreateDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedUserId?: string
  onSuccess?: () => void
}

export function CreateDepositModal({
  open,
  onOpenChange,
  preselectedUserId,
  onSuccess,
}: CreateDepositModalProps) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>(preselectedUserId || '')
  const [userAccounts, setUserAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  
  const [amount, setAmount] = useState<string>('')
  const [currency, setCurrency] = useState<string>('USD')
  const [senderName, setSenderName] = useState<string>('')
  const [senderBankName, setSenderBankName] = useState<string>('')
  const [senderRoutingNumber, setSenderRoutingNumber] = useState<string>('')
  const [senderAccountNumber, setSenderAccountNumber] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<string>('')

  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  // Success result state
  const [createdRef, setCreatedRef] = useState<string | null>(null)
  const [createdData, setCreatedData] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  // Fetch users when modal opens
  useEffect(() => {
    if (!open) {
      // Reset form state on close
      setCreatedRef(null)
      setCreatedData(null)
      setError('')
      return
    }

    const adminToken = localStorage.getItem('admin_token')
    if (adminToken) {
      apiClient.setAuthToken(adminToken)
    }

    if (preselectedUserId) {
      setSelectedUserId(preselectedUserId)
      fetchUserAccounts(preselectedUserId)
    } else {
      fetchUsersList()
    }
  }, [open, preselectedUserId])

  async function fetchUsersList() {
    setLoadingUsers(true)
    try {
      const adminId = localStorage.getItem('admin_id') || ''
      const qs = adminId ? `?admin_id=${adminId}&page_size=50` : `?page_size=50`
      const res = await apiClient.get<any>(`/admin/users/list${qs}`)
      if (res.success && res.data?.items) {
        const mappedUsers = res.data.items.map((u: any) => ({
          id: u.id,
          email: u.email,
          first_name: u.name ? u.name.split(' ')[0] : (u.first_name || u.email),
          last_name: u.name ? u.name.split(' ').slice(1).join(' ') : (u.last_name || ''),
          username: u.user_id || u.username || u.email,
        }))
        setUsers(mappedUsers)
        if (mappedUsers.length > 0 && !selectedUserId) {
          const firstUser = mappedUsers[0]
          setSelectedUserId(firstUser.id)
          fetchUserAccounts(firstUser.id)
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch users list', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  async function fetchUserAccounts(userId: string) {
    if (!userId) return
    setLoadingAccounts(true)
    try {
      const adminId = localStorage.getItem('admin_id') || ''
      const qs = adminId ? `?admin_id=${adminId}` : ''
      const res = await apiClient.get<any>(`/admin/users/${userId}/accounts${qs}`)
      
      let accountsList: any[] = []
      if (Array.isArray(res.data)) {
        accountsList = res.data
      } else if (Array.isArray(res.accounts)) {
        accountsList = res.accounts
      } else if (res.data?.accounts && Array.isArray(res.data.accounts)) {
        accountsList = res.data.accounts
      }

      if (accountsList.length > 0) {
        setUserAccounts(accountsList)
        setSelectedAccountId(accountsList[0].id)
        if (accountsList[0].currency) {
          setCurrency(accountsList[0].currency)
        }
      } else {
        setUserAccounts([])
        setSelectedAccountId('')
      }
    } catch (err: any) {
      console.error('Failed to fetch user accounts', err)
      setUserAccounts([])
      setSelectedAccountId('')
    } finally {
      setLoadingAccounts(false)
    }
  }

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedAccountId('')
    setUserAccounts([])
    fetchUserAccounts(userId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!selectedUserId) {
      setError('Please select a target user')
      return
    }
    if (!selectedAccountId) {
      setError('Please select an account for the deposit')
      return
    }
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid deposit amount greater than 0')
      return
    }
    if (!senderName.trim()) {
      setError('Please enter the Sender Account Holder Name')
      return
    }
    if (!senderBankName.trim()) {
      setError('Please enter the Sender Bank Name')
      return
    }

    setSubmitting(true)

    try {
      const adminToken = localStorage.getItem('admin_token')
      if (adminToken) {
        apiClient.setAuthToken(adminToken)
      }

      const payload = {
        user_id: selectedUserId,
        account_id: selectedAccountId,
        amount: numAmount,
        currency,
        sender_name: senderName.trim(),
        sender_bank_name: senderBankName.trim(),
        sender_routing_number: senderRoutingNumber.trim() || undefined,
        sender_account_number: senderAccountNumber.trim() || undefined,
        description: description.trim() || undefined,
        transaction_date: transactionDate || undefined,
      }

      const res = await apiClient.post<any>('/admin/transactions/create-deposit', payload)

      if (res.success && res.data) {
        setCreatedRef(res.data.reference_number)
        setCreatedData(res.data)
        toast.success(`Deposit created! Ref: ${res.data.reference_number}`)
        if (onSuccess) onSuccess()
      } else {
        setError(res.message || 'Failed to create deposit transaction')
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'An error occurred while creating deposit'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyRef = () => {
    if (createdRef) {
      navigator.clipboard.writeText(createdRef)
      setCopied(true)
      toast.success('Reference number copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Create Custom Deposit Transaction
          </DialogTitle>
          <DialogDescription className="text-sm" style={{ color: colors.textSecondary }}>
            Instantly credit a user&apos;s account with custom bank transfer details and generate an official reference code.
          </DialogDescription>
        </DialogHeader>

        {createdRef ? (
          /* Success Screen */
          <div className="py-6 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Deposit Transaction Created!</h3>
              <p className="text-sm text-gray-500">
                The account balance has been updated and the deposit is now listed at the top of the user&apos;s recent transactions.
              </p>
            </div>

            {/* Generated Reference Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Generated Reference Number</span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl font-mono font-extrabold text-slate-900 tracking-wider">
                  {createdRef}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyRef}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Summary Details */}
            {createdData && (
              <div className="rounded-xl border bg-white p-4 text-sm space-y-2.5">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Target User:</span>
                  <span className="font-medium text-gray-900">{createdData.user_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Deposit Amount:</span>
                  <span className="font-bold text-emerald-600">{createdData.currency} {createdData.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">New Account Balance:</span>
                  <span className="font-semibold text-gray-900">{createdData.currency} {createdData.new_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Description / Details:</span>
                  <span className="font-medium text-gray-900 text-right max-w-[280px] truncate">{createdData.description}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Status:</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Completed
                  </span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose} className="w-full bg-slate-900 text-white hover:bg-slate-800">
                Done & View Transactions
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Deposit Creation Form */
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            {error && (
              <div className="p-3 text-sm rounded-lg bg-red-50 text-red-600 border border-red-200">
                {error}
              </div>
            )}

            {/* Target User & Account */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Target User *
                </Label>
                {preselectedUserId ? (
                  <Input value={preselectedUserId} disabled className="bg-slate-50 font-medium" />
                ) : (
                  <Select value={selectedUserId} onValueChange={handleUserChange} disabled={loadingUsers}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingUsers ? 'Loading users...' : 'Select Target User'} />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.username} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                  Target Account *
                </Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={loadingAccounts || userAccounts.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingAccounts ? 'Loading accounts...' : (userAccounts.length === 0 ? 'No active accounts' : 'Select Account')} />
                  </SelectTrigger>
                  <SelectContent>
                    {userAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_type.toUpperCase()} (****{acc.account_number.slice(-4)}) - {acc.currency} {acc.balance?.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Deposit Amount & Currency */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-500">Deposit Amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-8 font-semibold text-lg"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-500">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="USD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="AUD">AUD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sender Details Header */}
            <div className="pt-2 border-t">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-emerald-600" />
                Sender & External Bank Details
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Sender Account Holder / Entity Name *</Label>
                  <Input
                    placeholder="e.g. JPMorgan Chase Bank / Acme Corp"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Sender Bank Name *</Label>
                  <Input
                    placeholder="e.g. Chase Bank, N.A."
                    value={senderBankName}
                    onChange={(e) => setSenderBankName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Sender Routing / ABA / SWIFT Number</Label>
                  <Input
                    placeholder="e.g. 021000021"
                    value={senderRoutingNumber}
                    onChange={(e) => setSenderRoutingNumber(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Sender Account Number / IBAN</Label>
                  <Input
                    placeholder="e.g. 1098472938"
                    value={senderAccountNumber}
                    onChange={(e) => setSenderAccountNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Optional Memo / Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Transaction Memo / Description (Optional)</Label>
                <Input
                  placeholder="e.g. Wire Transfer Deposit - Invoice Payment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Transaction Date & Time (Optional)</Label>
                <Input
                  type="datetime-local"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Deposit...
                  </>
                ) : (
                  <>
                    Save Deposit & Generate Reference
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
