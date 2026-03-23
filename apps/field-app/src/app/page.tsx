import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to dashboard (middleware will handle auth)
  redirect('/dashboard');
}
