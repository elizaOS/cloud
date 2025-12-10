/**
 * App Serve Service - Serves app content with runtime injection.
 */

import { db } from "@/db";
import { appDomains, appBundles, type AppDomain } from "@/db/schemas";
import { eq, and } from "drizzle-orm";

const APP_DOMAIN = process.env.APP_DOMAIN || "apps.elizacloud.ai";

interface ServeResult { html: string; headers: Record<string, string>; }
interface ServeError { status: number; html: string; }
type ServeResponse = { success: true; data: ServeResult } | { success: false; error: ServeError };

export async function serveApp(domain: AppDomain): Promise<ServeResponse> {
  const bundle = await db.query.appBundles.findFirst({
    where: and(eq(appBundles.app_id, domain.app_id), eq(appBundles.is_active, true)),
  });

  if (!bundle) {
    return { success: false, error: { status: 404, html: generateErrorPage("App Not Deployed", "This app has not been deployed yet.") } };
  }

  const bundleResponse = await fetch(`${bundle.bundle_url}/${bundle.entry_file}`);
  if (!bundleResponse.ok) {
    return { success: false, error: { status: 502, html: generateErrorPage("Bundle Error", "Failed to load app bundle.") } };
  }

  let html = await bundleResponse.text();
  const runtimeScript = generateRuntimeScript({
    appId: domain.app_id,
    subdomain: domain.subdomain,
    customDomain: domain.custom_domain,
    config: bundle.runtime_config,
  });

  html = html.includes("<!-- Eliza Cloud Runtime Placeholder -->")
    ? html.replace("<!-- Eliza Cloud Runtime Placeholder -->", runtimeScript)
    : html.replace("</head>", `${runtimeScript}</head>`);

  return {
    success: true,
    data: {
      html,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-App-Version": String(bundle.version),
        "X-App-Hash": bundle.build_hash || "",
        "X-App-Subdomain": domain.subdomain,
      },
    },
  };
}

export const getDomainBySubdomain = (subdomain: string) =>
  db.query.appDomains.findFirst({ where: eq(appDomains.subdomain, subdomain) });

export const getDomainByCustomDomain = (customDomain: string) =>
  db.query.appDomains.findFirst({ where: eq(appDomains.custom_domain, customDomain) });

function generateRuntimeScript(options: {
  appId: string;
  subdomain: string;
  customDomain: string | null;
  config: Record<string, boolean | string> | null;
}): string {
  const { appId, subdomain, customDomain, config } = options;
  const baseUrl = customDomain ? `https://${customDomain}` : `https://${subdomain}.${APP_DOMAIN}`;
  const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  return `<script>
window.__ELIZA_CLOUD__={
  appId:"${appId}",subdomain:"${subdomain}",customDomain:${customDomain?`"${customDomain}"`:"null"},
  baseUrl:"${baseUrl}",cloudUrl:"${cloudUrl}",apiUrl:"/api/v1/app",config:${JSON.stringify(config||{})},
  
  // Auth
  async getUser(){const r=await fetch(this.apiUrl+"/auth/user",{credentials:"include"});return r.ok?r.json():null},
  login(p="google"){location.href=this.apiUrl+"/auth/login?provider="+p+"&redirect="+encodeURIComponent(location.href)},
  async logout(){await fetch(this.apiUrl+"/auth/logout",{method:"POST",credentials:"include"});location.reload()},
  
  // Platform Credentials
  async getCredentials(){const r=await fetch(this.apiUrl+"/credentials",{credentials:"include"});return r.ok?(await r.json()).credentials||[]:[]},
  async getCredential(p){return(await this.getCredentials()).find(c=>c.platform===p&&c.status==="active")||null},
  async connectPlatform(platform,opts={}){
    const r=await fetch(this.apiUrl+"/credentials",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform,scopes:opts.scopes})});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"Failed to connect");
    const{sessionId,hostedLinkUrl}=await r.json();
    const popup=window.open(hostedLinkUrl,"ElizaOAuth","width=600,height=700,scrollbars=yes");
    if(!popup)throw new Error("Popup blocked");
    return new Promise((resolve,reject)=>{
      const poll=setInterval(async()=>{
        if(popup.closed){clearInterval(poll);const s=await this._checkSession(sessionId);s.status==="completed"?resolve(await this.getCredential(platform)):reject(new Error("Cancelled"));return}
        const s=await this._checkSession(sessionId);
        if(s.status==="completed"){clearInterval(poll);popup.close();resolve(await this.getCredential(platform))}
        else if(s.status==="failed"||s.status==="expired"){clearInterval(poll);popup.close();reject(new Error(s.error||"Failed"))}
      },1500);
      setTimeout(()=>{clearInterval(poll);popup.closed||popup.close();reject(new Error("Timeout"))},300000);
    });
  },
  async disconnectPlatform(p){const c=await this.getCredential(p);if(!c)return true;return(await fetch(this.apiUrl+"/credentials/"+c.id,{method:"DELETE",credentials:"include"})).ok},
  async getPlatformToken(p){const c=await this.getCredential(p);if(!c)throw new Error(p+" not connected");const r=await fetch(this.apiUrl+"/credentials/"+c.id+"/token",{credentials:"include"});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"Failed");return r.json()},
  async _checkSession(id){const r=await fetch(this.apiUrl+"/credentials/session/"+id,{credentials:"include"});return r.ok?r.json():{status:"error"}},
  
  // Secrets (encrypted key-value storage)
  async getSecret(name){const r=await fetch(this.apiUrl+"/secrets/"+encodeURIComponent(name),{credentials:"include"});return r.ok?(await r.json()).value:null},
  async setSecret(name,value,desc){const r=await fetch(this.apiUrl+"/secrets",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,value,description:desc})});return r.ok},
  async deleteSecret(name){return(await fetch(this.apiUrl+"/secrets/"+encodeURIComponent(name),{method:"DELETE",credentials:"include"})).ok},
  async listSecrets(){const r=await fetch(this.apiUrl+"/secrets",{credentials:"include"});return r.ok?(await r.json()).secrets||[]:[]},
  
  // Storage (unencrypted key-value)
  async getStorage(k){const r=await fetch(this.apiUrl+"/storage/"+encodeURIComponent(k),{credentials:"include"});return r.ok?r.json():null},
  async setStorage(k,v){return(await fetch(this.apiUrl+"/storage/"+encodeURIComponent(k),{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({value:v})})).ok},
  
  // Bot Connections (Discord/Telegram/Twitter bots)
  async getBots(){const r=await fetch(this.apiUrl+"/bots",{credentials:"include"});return r.ok?(await r.json()).bots||[]:[]},
  async getBot(id){const r=await fetch(this.apiUrl+"/bots/"+id,{credentials:"include"});return r.ok?(await r.json()).bot:null},
  async connectBot(platform,token){const r=await fetch(this.apiUrl+"/bots",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform,botToken:token})});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"Failed");return r.json()},
  async disconnectBot(id){return(await fetch(this.apiUrl+"/bots/"+id,{method:"DELETE",credentials:"include"})).ok},
  
  // API proxy
  fetch(path,opts={}){return fetch(this.apiUrl+"/proxy"+path,{...opts,credentials:"include"})}
};
</script>`;
}

export function generateErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}|elizaOS</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%);font-family:system-ui,-apple-system,sans-serif;color:#fff}.c{text-align:center;padding:2rem}.i{width:80px;height:80px;margin:0 auto 1.5rem;opacity:.3}h1{font-size:1.5rem;margin-bottom:.5rem;color:#FF5800}p{color:rgba(255,255,255,.6);max-width:400px}a{display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#FF5800;color:#fff;text-decoration:none;border-radius:8px;font-weight:500}a:hover{background:#ff6a1a}</style></head><body><div class="c"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><h1>${title}</h1><p>${message}</p><a href="https://elizacloud.ai">Go to elizaOS</a></div></body></html>`;
}

export const appServeService = { serveApp, getDomainBySubdomain, getDomainByCustomDomain, generateErrorPage };
