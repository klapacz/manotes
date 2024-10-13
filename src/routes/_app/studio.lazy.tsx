import { Studio } from '@/components/studio'
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/_app/studio')({
  component: StudioPage,
})

function StudioPage() {
  return (
    <div className="p-2">
      <Studio />
    </div>
  )
}
