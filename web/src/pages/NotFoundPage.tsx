import { Link } from 'react-router'
import { buttonStyles, cardStyles } from '../components/ui.tsx'

export function NotFoundPage() {
  return (
    <div className={`${cardStyles} mx-auto max-w-md text-center`}>
      <p className="font-medium">This page doesn't exist.</p>
      <Link to="/" className={`${buttonStyles.primary} mt-4`}>
        Back to your goals
      </Link>
    </div>
  )
}
