import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';

config({path:'.env.local',quiet:true});
config({path:'.env',quiet:true});
const workspaceId='a54cdbe5-1799-473f-9780-6e0e53786f84';
const userId='PIINPnqwnW7k8nKwbK3HSIrcxgGLc8oY';
try {
  const url=new URL(process.env.DATABASE_URL ?? '');
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/image_prodaction') throw new Error('Only the verified local Image Production database is allowed.');
  if(process.argv.slice(2).some(arg=>arg!=='--apply')) throw new Error('Only --apply is accepted.');
  await getDb().transaction(async tx=>{
    const [owner]=await tx.select({id:user.id,email:user.email}).from(user).where(eq(user.id,userId));
    if(owner?.email!=='mzh@ya.ru') throw new Error('The explicitly approved source account no longer matches.');
    const [existing]=await tx.select().from(workspace).where(eq(workspace.id,workspaceId));
    if(existing && (existing.name!=='REVERIE'||existing.kind!=='team'||existing.createdByUserId!==userId)) throw new Error('Existing Workspace conflicts; no changes made.');
    const [member]=await tx.select().from(membership).where(and(eq(membership.workspaceId,workspaceId),eq(membership.userId,userId)));
    if(member && member.role!=='owner') throw new Error('Existing membership conflicts; no changes made.');
    if(process.argv.includes('--apply')) {
      if(!existing) await tx.insert(workspace).values({id:workspaceId,name:'REVERIE',kind:'team',createdByUserId:userId});
      if(!member) await tx.insert(membership).values({workspaceId,userId,role:'owner'});
    }
    console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',workspaceId,userId,alreadyExists:Boolean(existing),personalWorkspaceChanged:false,paidOperations:false}));
  },{isolationLevel:'serializable'});
} catch(error) { console.error(error instanceof Error ? error.message : 'Provisioning failed');process.exitCode=1; }
finally {await getPostgresPool().end();}
