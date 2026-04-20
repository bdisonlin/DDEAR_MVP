import { useState, useEffect } from 'react'
import { getSettings, updateSettings } from '@/api/settings'

export default function Settings() {
  const [jsonText, setJsonText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getSettings()
      .then(data => {
        setJsonText(JSON.stringify(data, null, 2))
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    let parsedData
    try {
      parsedData = JSON.parse(jsonText)
    } catch (err) {
      setError('JSON 格式錯誤，請檢查語法是否正確！')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await updateSettings(parsedData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin-slow" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系統設定 (費率參數表)</h1>
          <p className="text-sm text-ios-gray1 mt-1">
            所有的更改都會即時寫入後端，不需重新啟動模擬引擎便會自動套用於接下來的運算。
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />}
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-xl text-sm border border-red-200">
          <strong>⚠️ 錯誤：</strong> {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 text-green-700 rounded-xl text-sm border border-green-200">
          <strong>✅ 成功：</strong> 系統設定已經無縫熱更新並寫入磁碟！
        </div>
      )}

      <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-black/10 dark:border-white/10 p-1 flex flex-col items-center">
        <div className="w-full flex items-center gap-2 p-3 border-b border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 rounded-t-xl">
           <span className="w-3 h-3 rounded-full bg-red-400"></span>
           <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
           <span className="w-3 h-3 rounded-full bg-green-400"></span>
           <span className="text-xs font-mono text-ios-gray1 ml-2">tariff_data.json</span>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="w-full h-[600px] p-4 bg-transparent outline-none font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 resize-y"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
