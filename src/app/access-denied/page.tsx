import Link from 'next/link'
export default function AccessDenied(){return <main className="mx-auto max-w-lg space-y-4 p-10"><h1 className="text-xl font-semibold">暂无此页面权限</h1><p>任务中心和个人工作模块仅工作台所有者可访问。请返回已授权的协作页面。</p><Link href="/" className="font-semibold text-emerald-800 underline">返回可访问页面</Link><p><Link href="/login" className="underline">返回登录</Link></p></main>}
