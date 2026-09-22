import { redirect } from 'next/navigation';

/** Existing bookmarks remain safe; conversations now live in the sidebar. */
export default function ChatsPage() { redirect('/'); }
