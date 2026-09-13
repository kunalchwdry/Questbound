import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { WorldShell } from '@/components/community/WorldShell';
import type { ReactNode } from 'react';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function WorldLayout({children}:{children:ReactNode}){const user=await getSessionUser();if(!user)redirect('/login');return <WorldShell user={{id:user.id,name:user.displayName,classKey:user.classKey}}>{children}</WorldShell>;}
