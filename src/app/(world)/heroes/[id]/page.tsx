import { HeroSheet } from '@/components/community/HeroSheet';
export const metadata={title:'Hero character sheet'};
export default async function Page({params}:{params:Promise<{id:string}>}){return <HeroSheet id={Number((await params).id)}/>;}
