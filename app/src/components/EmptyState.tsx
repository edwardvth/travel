export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center text-center py-20 px-6">
      <h3 className="font-serif font-medium text-2xl">{title}</h3>
      <p className="text-muted text-[14px] mt-2 max-w-xs">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
