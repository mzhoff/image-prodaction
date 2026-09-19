import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
const url=new URL(process.env.PLATFORM_TEST_ADMIN_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Only loopback database is allowed');
url.pathname='/postgres';const admin=new pg.Pool({connectionString:url.toString()});
const name=`image_budget_test_${randomBytes(6).toString('hex')}`;
let created=false;
try {
 await admin.query(`CREATE DATABASE "${name}"`);created=true;url.pathname=`/${name}`;
 const env={...process.env,DATABASE_URL:url.toString(),CI:'true',AI_PROVIDER_RUNTIME:'fake',PLATFORM_PAID_REQUEST_GUARD:'true',
  REVERIE_IDENTITY_ISSUER:'https://id.example.test',PLATFORM_PROJECTION_SECRET:'test-only-secret-test-only-secret',
  PROVIDER_CREDENTIALS_MASTER_KEY:randomBytes(32).toString('base64'),PROVIDER_CREDENTIALS_FINGERPRINT_KEY:randomBytes(32).toString('base64')};
 for(const [command,args] of [['npm',['run','db:migrate']],[process.execPath,['--experimental-strip-types','--loader','./scripts/node-test-loader.mjs','scripts/platform-budget-projection-smoke.ts']]]){
  const child=spawn(command,args,{stdio:'inherit',env});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  if(code){process.exitCode=code;break;}
 }
} finally{if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();}
