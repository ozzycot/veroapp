import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════
   VERO — Seu negócio responde no tempo certo.
   ═══════════════════════════════════════════════════ */

const C = {
  bg:"#FFFFFF", surface:"#F8FAFC", border:"#E2E8F0", borderStrong:"#CBD5E1",
  primary:"#0F172A", accent:"#6366F1", accentLight:"#EEF2FF", accentBorder:"#C7D2FE",
  text:"#0F172A", muted:"#64748B", mutedLight:"#94A3B8",
  success:"#059669", successLight:"#ECFDF5", successBorder:"#A7F3D0",
  danger:"#DC2626", dangerLight:"#FEF2F2", dangerBorder:"#FECACA",
  warning:"#D97706", warningLight:"#FFFBEB", warningBorder:"#FDE68A",
  whatsapp:"#25D366", whatsappLight:"#E7F9EF",
  email:"#4285F4", emailLight:"#EBF2FE",
  white:"#FFFFFF",
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:${C.bg};font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;}
  input,button,textarea,select{font-family:'Plus Jakarta Sans',sans-serif;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes blink{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
  .fade-up{animation:fadeUp .45s ease both;}
  .fade-in{animation:fadeIn .35s ease both;}
  .slide-in{animation:slideIn .3s ease both;}
  .btn{transition:all .15s ease;cursor:pointer;border:none;font-family:'Plus Jakarta Sans',sans-serif;}
  .btn:hover{filter:brightness(.94);}
  .btn:active{transform:scale(.98);}
  .pulse-dot{animation:pulse 2s ease-in-out infinite;}
`;

async function claude(apiKey, messages, system="", max=800) {
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:max,system,messages}),
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message);
  return data.content.map(b=>b.text||"").join("");
}

// ═══════════════════════════════════════════════════════
// SUPABASE — REST API helper (no SDK needed)
// ═══════════════════════════════════════════════════════
function createSupabase(url, key) {
  url = url.replace(/\/+$/, ''); // remove trailing slash
  const h = (token) => ({
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${token || key}`,
    "Prefer": "return=representation",
  });
  const api = async (path, token, opts={}) => {
    const r = await fetch(`${url}${path}`, { headers: h(token), ...opts });
    const txt = await r.text();
    if(txt.trim().startsWith("<")) {
      // HTML returned = wrong URL
      throw new Error("URL incorreta — verifique o Project URL no Supabase (sem barra no final).");
    }
    try { return JSON.parse(txt); } catch { return { error: { message: txt } }; }
  };
  return {
    // Auth
    signUp: (email,pw) => api("/auth/v1/signup","",{method:"POST",body:JSON.stringify({email,password:pw})}),
    signIn: (email,pw) => api(`/auth/v1/token?grant_type=password`,"",{method:"POST",body:JSON.stringify({email,password:pw})}),
    getUser: (token)   => api("/auth/v1/user", token),
    // Data — returns array or object
    select: (table,token,qs="") => api(`/rest/v1/${table}?select=*${qs?`&${qs}`:""}`,token),
    insert: (table,token,data)  => api(`/rest/v1/${table}`,token,{method:"POST",body:JSON.stringify(data)}),
    upsert: (table,token,data)  => api(`/rest/v1/${table}`,token,{
      method:"POST",
      headers:{...h(token),"Prefer":"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify(data),
    }),
    update: (table,token,qs,data) => api(`/rest/v1/${table}?${qs}`,token,{method:"PATCH",body:JSON.stringify(data)}),
    remove: (table,token,qs)      => api(`/rest/v1/${table}?${qs}`,token,{method:"DELETE"}),
  };
}

// SQL schema (run once in Supabase SQL editor):
// See VERO_SCHEMA below for the full migration
const VERO_SCHEMA = `
-- 1. Profiles (one per user)
create table if not exists profiles (
  id uuid references auth.users primary key,
  email text, nome text, area text,
  horarios text, cancelamento text,
  tom text default 'informal',
  emoji text default 'às vezes',
  tratamento text default 'primeiro nome',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for all using (auth.uid()=id);

-- 2. Clients
create table if not exists clients (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  name text not null, ini text, area text,
  status text default 'ativo', mrr integer default 0,
  sessions integer default 0, last_contact_days integer default 0,
  created_at timestamptz default now()
);
alter table clients enable row level security;
create policy "own clients" on clients for all using (auth.uid()=profile_id);

-- 3. Leads
create table if not exists leads (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  name text not null, ini text, source text,
  stage text default 'novo', interest text,
  hot boolean default false,
  created_at timestamptz default now()
);
alter table leads enable row level security;
create policy "own leads" on leads for all using (auth.uid()=profile_id);

-- 4. Settings
create table if not exists settings (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade unique,
  max_discount integer default 15,
  auto_learn boolean default true,
  wp_numero text, wp_tipo text default 'business',
  wp_conectado boolean default false,
  email_addr text, email_conectado boolean default false,
  persona jsonb default '{}',
  limits jsonb default '{}',
  updated_at timestamptz default now()
);
alter table settings enable row level security;
create policy "own settings" on settings for all using (auth.uid()=profile_id);
`;



// ═══════════════════════════════════════════════════════
// MOCK DATA — rich, realistic simulation
// ═══════════════════════════════════════════════════════

const MOCK_CLIENTS = [
  {id:1,name:"Ana Paula Ferreira", ini:"AP",area:"Psicologia", days:43,mrr:350,status:"risco",  sessions:12},
  {id:2,name:"Carlos Eduardo Melo",ini:"CE",area:"Nutrição",   days:6, mrr:280,status:"ativo",  sessions:9 },
  {id:3,name:"Fernanda Gomes",     ini:"FG",area:"Personal",   days:2, mrr:600,status:"ativo",  sessions:28},
  {id:4,name:"Roberto Siqueira",   ini:"RS",area:"Psicologia", days:67,mrr:350,status:"inativo",sessions:4 },
  {id:5,name:"Juliana Novaes",     ini:"JN",area:"Nutrição",   days:18,mrr:280,status:"alerta", sessions:15},
  {id:6,name:"Marcos Vinicius",    ini:"MV",area:"Personal",   days:1, mrr:600,status:"ativo",  sessions:35},
  {id:7,name:"Camila Andrade",     ini:"CA",area:"Psicologia", days:14,mrr:350,status:"ativo",  sessions:22},
  {id:8,name:"Thiago Correia",     ini:"TC",area:"Nutrição",   days:30,mrr:280,status:"alerta", sessions:6 },
];

const MOCK_AGENDA = [
  {id:1,client:"Carlos Eduardo Melo",time:"09:00",service:"Consulta de Nutrição", confirmed:true, min:50},
  {id:2,client:"Fernanda Gomes",     time:"10:00",service:"Personal Training",    confirmed:true, min:60},
  {id:3,client:"Lead — Maria Clara", time:"13:30",service:"Avaliação Inicial",     confirmed:false,min:60},
  {id:4,client:"Camila Andrade",     time:"15:00",service:"Sessão de Psicologia", confirmed:true, min:50},
  {id:5,client:"Marcos Vinicius",    time:"17:00",service:"Personal Training",    confirmed:true, min:60},
];

const MOCK_LEADS = [
  {id:101, name:"Maria Clara Souza",   ini:"MC", source:"whatsapp", stage:"agendou",    days:0, interest:"Sessão de psicologia",      hot:true },
  {id:102, name:"Patrícia Lima",        ini:"PL", source:"whatsapp", stage:"conversando",days:1, interest:"Nutrição — perda de peso",   hot:true },
  {id:103, name:"Diego Ramos",          ini:"DR", source:"email",    stage:"novo",       days:2, interest:"Pacote mensal personal",     hot:false},
  {id:104, name:"Luiza Barreto",        ini:"LB", source:"indicacao",stage:"conversando",days:3, interest:"Avaliação nutricional",      hot:false},
  {id:105, name:"Eduardo Pinheiro",     ini:"EP", source:"whatsapp", stage:"novo",       days:4, interest:"Sessão de coaching",         hot:false},
];

const LEAD_STAGES = [
  {id:"novo",        label:"Novo",        color:C.mutedLight},
  {id:"conversando", label:"Conversando", color:C.warning},
  {id:"agendou",     label:"Agendou",     color:C.accent},
  {id:"compareceu",  label:"Compareceu",  color:C.success},
];

const MOCK_CONVERSATIONS = [
  {
    id:1, clientId:101, name:"Maria Clara Souza", ini:"MC", channel:"whatsapp",
    lastActivity:"há 5 min", unread:0, status:"auto_replied", summary:"Lead convertido — agendou avaliação",
    messages:[
      {from:"client", text:"Oi! Vi o Instagram da Dra, me indicaram muito. Vc atende psicologia ainda?",   time:"08:42"},
      {from:"ai",     text:"Oi Maria Clara! Sim, atendo 💛 Fico feliz que tenha chegado até aqui. Como posso te ajudar?", time:"08:42"},
      {from:"client", text:"Queria saber como funciona, valores e se tem horário essa semana", time:"08:44"},
      {from:"ai",     text:"Claro! A sessão individual é R$350, duração de 50 minutos, online ou presencial. Essa semana tenho quarta às 14h ou sexta às 10h.", time:"08:44"},
      {from:"client", text:"Quarta 14h seria perfeito!", time:"08:51"},
      {from:"ai",     text:"Fechado! Agendei Maria Clara Souza para quarta-feira (26/04) às 14h. Vou te mandar lembrete 1 dia antes. Qualquer coisa estou por aqui 😊", time:"08:51"},
    ],
  },
  {
    id:2, clientId:1, name:"Ana Paula Ferreira", ini:"AP", channel:"whatsapp",
    lastActivity:"há 1h", unread:1, status:"auto_replied", summary:"Reativação — respondeu, reaquecendo",
    messages:[
      {from:"ai",     text:"Oi Ana! Faz um tempinho que não conversamos. Como você tá? Se quiser retomar nossos encontros, tenho algumas opções essa semana.", time:"07:40", automated:true, trigger:"Reativação automática — 43 dias sem contato"},
      {from:"client", text:"Oi Dra, nossa obrigada por lembrar! Andei bem corrida esse mês mas quero voltar sim. Deixa eu ver minha agenda e te falo!", time:"08:55"},
      {from:"ai",     text:"Sem pressa Ana, fico feliz que queira voltar. Quando quiser marcar é só me chamar 🌷", time:"08:56"},
    ],
  },
  {
    id:3, clientId:5, name:"Juliana Novaes", ini:"JN", channel:"whatsapp",
    lastActivity:"há 18 min", unread:1, status:"needs_approval", summary:"Pediu desconto acima do limite — aguardando você",
    messages:[
      {from:"client", text:"Oi Dra! Queria saber se dá pra fazer um desconto no pacote de 4 sessões", time:"14:03"},
      {from:"ai",     text:"Oi Juliana! Posso te oferecer 10% de desconto no pacote fechado, fica R$1.260 no total.", time:"14:03"},
      {from:"client", text:"Conseguiria fazer 20%? Tá um pouco apertado esse mês", time:"14:08"},
      {from:"ai_wait", text:"Juliana pediu 20% de desconto. Seu limite é 15%. Quer aprovar?", time:"14:08", pending:true, discountRequested:20, currentLimit:15},
    ],
  },
  {
    id:4, clientId:4, name:"Roberto Siqueira", ini:"RS", channel:"email",
    lastActivity:"há 2h", unread:1, status:"needs_attention", summary:"Reclamação detectada — IA não respondeu",
    messages:[
      {from:"client", text:"Boa tarde, Dra. Confesso que fiquei um pouco desconfortável com a última sessão, senti que foi bem corrida e não pude falar do que precisava. Queria conversar sobre isso antes de remarcar.", time:"12:15", subject:"Sobre a última sessão"},
      {from:"ai_flag", text:"Detectei que pode ser uma reclamação sensível. Não respondi automaticamente. Quer ver uma sugestão de resposta?", time:"12:16", flagged:true},
    ],
  },
  {
    id:5, clientId:2, name:"Carlos Eduardo Melo", ini:"CE", channel:"whatsapp",
    lastActivity:"há 30 min", unread:0, status:"auto_replied", summary:"Confirmação enviada — consulta amanhã",
    messages:[
      {from:"ai",     text:"Oi Carlos! Lembrete: sua consulta é amanhã (26/04) às 09h. Posso confirmar sua presença?", time:"13:30", automated:true, trigger:"Lembrete 24h antes"},
      {from:"client", text:"Confirmado Dra, até amanhã!", time:"13:33"},
      {from:"ai",     text:"Perfeito Carlos, te espero! Qualquer imprevisto é só avisar 👍", time:"13:33"},
    ],
  },
  {
    id:6, clientId:3, name:"Fernanda Gomes", ini:"FG", channel:"whatsapp",
    lastActivity:"há 3h", unread:0, status:"auto_replied", summary:"Avaliação positiva → Google review enviado",
    messages:[
      {from:"ai",     text:"Oi Fernanda! Como você se sentiu após o treino hoje?", time:"11:45", automated:true, trigger:"Pós-atendimento"},
      {from:"client", text:"Amei! Saí muito bem disposta, vc é demais Dra!", time:"11:52"},
      {from:"ai",     text:"Que bom ler isso 💪 Se puder deixar sua opinião no Google, ajuda muito quem está procurando: g.page/r/dra-fisio/review", time:"11:52"},
      {from:"client", text:"Claro, deixa comigo!", time:"11:55"},
    ],
  },
  {
    id:7, clientId:102, name:"Patrícia Lima", ini:"PL", channel:"whatsapp",
    lastActivity:"há 4h", unread:0, status:"auto_replied", summary:"Lead aquecendo — tirando dúvidas",
    messages:[
      {from:"client", text:"Oi, gostaria de saber como funciona a consulta nutricional", time:"10:22"},
      {from:"ai",     text:"Oi Patrícia! Minhas consultas duram 50min, e fazemos uma anamnese completa, bioimpedância e plano alimentar personalizado. O acompanhamento mensal é R$280. Quer marcar uma avaliação?", time:"10:22"},
      {from:"client", text:"Interessante! Deixa eu pensar um pouquinho e já te falo", time:"10:28"},
      {from:"ai",     text:"Claro Patrícia, sem pressa! Qualquer dúvida me chama 😊", time:"10:28"},
    ],
  },
];

const MOCK_AUTOMATIONS = [
  {time:"14:08", type:"flag",       title:"Pedido de desconto acima do limite",    desc:"Juliana Novaes — 20% solicitado (limite: 15%)",       icon:"⚠"},
  {time:"13:33", type:"confirm",    title:"Confirmação automática",                 desc:"Carlos confirmou consulta de amanhã",                 icon:"✓"},
  {time:"13:30", type:"reminder",   title:"Lembrete enviado",                        desc:"Carlos — consulta 09:00 amanhã",                      icon:"⏰"},
  {time:"12:15", type:"flag",       title:"Reclamação detectada",                    desc:"Roberto enviou email — aguardando sua atenção",       icon:"⚠"},
  {time:"11:55", type:"review",     title:"Avaliação Google solicitada",             desc:"Fernanda — avaliação positiva detectada",             icon:"⭐"},
  {time:"11:45", type:"postservice",title:"Follow-up pós atendimento",               desc:"Fernanda — pergunta sobre experiência",               icon:"💬"},
  {time:"10:28", type:"lead",       title:"Lead em aquecimento",                     desc:"Patrícia Lima — tirou dúvidas sobre consulta",        icon:"🔥"},
  {time:"08:56", type:"reactivate", title:"Reativação bem-sucedida",                 desc:"Ana Paula respondeu após 43 dias",                    icon:"↺"},
  {time:"08:51", type:"booking",    title:"Agendamento automático",                  desc:"Maria Clara — quarta 14h (lead convertido)",          icon:"📅"},
  {time:"08:42", type:"lead",       title:"Novo lead capturado",                     desc:"Maria Clara — WhatsApp, indicação Instagram",         icon:"✨"},
  {time:"07:40", type:"reactivate", title:"Reativação disparada",                    desc:"Ana Paula — 43 dias sem contato",                     icon:"↺"},
  {time:"07:15", type:"review",     title:"3 pedidos de avaliação enviados",         desc:"Clientes pós-atendimento de ontem",                   icon:"⭐"},
];

const LEARNED_PATTERNS = [
  {label:"Saudação preferida",   value:'"Oi" em 94% das mensagens', confidence:94},
  {label:"Despedida típica",     value:'"Um abraço" ou 🌷',           confidence:88},
  {label:"Uso de emoji",          value:"Em ~60% das respostas",       confidence:82},
  {label:"Tom geral",             value:"Caloroso e acolhedor",        confidence:91},
  {label:"Horário de resposta",   value:"8h–12h e 14h–18h",            confidence:97},
  {label:"Encaixes frequentes",   value:"Terças e quintas à tarde",    confidence:76},
];

const statusMeta = s=>({
  ativo:  {label:"Ativo",   bg:C.successLight,color:C.success,border:C.successBorder},
  risco:  {label:"Em risco",bg:C.dangerLight, color:C.danger, border:C.dangerBorder },
  alerta: {label:"Alerta",  bg:C.warningLight,color:C.warning,border:C.warningBorder},
  inativo:{label:"Inativo", bg:C.surface,     color:C.muted,  border:C.border       },
}[s]||{label:s,bg:C.surface,color:C.muted,border:C.border});

const todayStr = new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});

// ═══════════════════════════════════════════════════════
// LOGO & ICON — Vero brand assets
// ═══════════════════════════════════════════════════════

const VERO_WORDMARK = "data:image/png;base64,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0xRHCCo4nCOdTuq8OokinDXyRSVFdCptT69e3elz7JEcc/ThtG5V4pZYvxsfCiH45LOvuGjsjUTjcVfzEO60VnECXxSBYUTpe/xR3HP3PxvNTZYL7R7Wr9/Ewg8+5o03F/HRR5+wcs06KsrLiVs2EgXheisUN6LSdufUUjqbe+iKSpNmzWjfrjXduh9KvxOPoc8xPWlf2jpRxq6s86+KwcHPGJLyiiqqqqqxbRtN02jSpJAmheHE/V8L/B2uvKKStWs38sOPzgGAy1euZt26jVRu20YsVoFAoushguGmNC1uRuuWJbRv15aOHUrZb7/OtC9tTRPfuVbSM/rUO81gGKbrf091USa1D+dyIKDTrFn9Hz5YH/C3/bbyStas2cBXX3/PipVrWLt+A+vXbaSyYhvRSCVI0PUCCps1o7S0De1L29B5r44ccEAXStu1orioSUp+u0Mf/NUxuIds8dq7Q6PuDLLVy7ZlYr6oqkmJkg2NFVCSK3b391Lb/vmWJZ0toaRzvLKmZTdd7W71/NUy+P8n1MZIu1uH2pOQagNJxa+l3XfbSLY8kvi1dKY9DTJjnMGvC78aN1keeeSx/cgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MHIM3geeezByDN4HnnswcgzeB557MH4P1iy0oBpS3sUAAAAAElFTkSuQmCC";
const VERO_ICON     = "data:image/png;base64,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";

function MiraLogo({size=22, dark=true}){
  return(
    <img
      src={VERO_WORDMARK}
      alt="Vero"
      style={{
        height: size + "px",
        width: "auto",
        display: "block",
        filter: dark ? "none" : "brightness(0) invert(1)",
      }}
    />
  );
}

function MiraIcon({size=32}){
  return(
    <img
      src={VERO_ICON}
      alt="Vero"
      style={{
        width: size + "px",
        height: size + "px",
        borderRadius: Math.round(size * 0.22) + "px",
        display: "block",
        flexShrink: 0,
        objectFit: "contain",
      }}
    />
  );
}

// Channel icons
const WhatsAppIcon = ({size=14}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={C.whatsapp}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const EmailIcon = ({size=14}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.email} strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

function Dots(){
  return(
    <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
      {[0,1,2].map(i=>(
        <div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:C.accent,animation:"blink 1.3s ease-in-out infinite",animationDelay:`${i*.2}s`}}/>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// UI ATOMS
// ═══════════════════════════════════════════════════════
function Card({title,children,action,noPad}){
  return(
    <div style={{background:C.white,borderRadius:"12px",padding:noPad?"0":"16px",border:`1px solid ${C.border}`,marginBottom:"12px",overflow:"hidden"}}>
      {title && (
        <div style={{padding:noPad?"16px 16px 12px":"0",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:noPad?"0":"12px"}}>
          <h3 style={{fontSize:"10.5px",fontWeight:700,color:C.muted,letterSpacing:"0.07em",textTransform:"uppercase"}}>{title}</h3>
          {action}
        </div>
      )}
      <div style={{padding:noPad?"0 16px 16px":"0"}}>{children}</div>
    </div>
  );
}

function InfoRow({label,value}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:"13px"}}>
      <span style={{color:C.muted,fontWeight:500}}>{label}</span>
      <span style={{color:C.text,fontWeight:600,maxWidth:"58%",textAlign:"right"}}>{value}</span>
    </div>
  );
}

function RadioRow({label,sublabel,active,onClick}){
  return(
    <button onClick={onClick} className="btn" style={{width:"100%",background:active?C.accentLight:"none",border:`1.5px solid ${active?C.accent:C.border}`,borderRadius:"8px",padding:"10px 14px",fontSize:"13px",color:C.text,textAlign:"left",marginBottom:"6px",display:"flex",alignItems:"center",gap:"10px",fontWeight:active?600:400,transition:"all .15s"}}>
      <span style={{width:"16px",height:"16px",borderRadius:"50%",border:`2px solid ${active?C.accent:C.border}`,background:active?C.accent:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
        {active&&<span style={{width:"6px",height:"6px",borderRadius:"50%",background:C.white}}/>}
      </span>
      <div>
        <div>{label}</div>
        {sublabel&&<div style={{fontSize:"11px",color:active?C.accent:C.muted,fontWeight:400,marginTop:"1px"}}>{sublabel}</div>}
      </div>
    </button>
  );
}

function Toggle({on,onClick,size="md"}){
  const w = size==="sm"?"34px":"40px", h = size==="sm"?"20px":"23px", dot = size==="sm"?"14px":"17px", off = size==="sm"?"3px":"3px", onX = size==="sm"?"17px":"20px";
  return(
    <div onClick={onClick} style={{width:w,height:h,borderRadius:"12px",background:on?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
      <div style={{position:"absolute",top:"3px",left:on?onX:off,width:dot,height:dot,borderRadius:"50%",background:C.white,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
    </div>
  );
}

function FInput({label,value,onChange,placeholder,type="text",hint}){
  const [f,setF]=useState(false);
  return(
    <div style={{marginBottom:"12px"}}>
      {label&&<label style={{display:"block",fontSize:"11.5px",fontWeight:600,color:C.muted,marginBottom:"5px",letterSpacing:"0.03em"}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""}
        style={{width:"100%",padding:"10px 13px",border:`1.5px solid ${f?C.accent:C.border}`,borderRadius:"8px",fontSize:"13.5px",outline:"none",background:C.surface,color:C.text,transition:"border-color .15s"}}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>
      {hint&&<p style={{fontSize:"11px",color:C.mutedLight,marginTop:"4px"}}>{hint}</p>}
    </div>
  );
}

function FTextarea({label,value,onChange,placeholder,rows=3}){
  const [f,setF]=useState(false);
  return(
    <div style={{marginBottom:"12px"}}>
      {label&&<label style={{display:"block",fontSize:"11.5px",fontWeight:600,color:C.muted,marginBottom:"5px",letterSpacing:"0.03em"}}>{label}</label>}
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""} rows={rows}
        style={{width:"100%",padding:"10px 13px",resize:"vertical",border:`1.5px solid ${f?C.accent:C.border}`,borderRadius:"8px",fontSize:"13.5px",outline:"none",background:C.surface,color:C.text,transition:"border-color .15s",lineHeight:1.55}}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>
    </div>
  );
}

function FSlider({label,value,onChange,min=0,max=100,step=1,suffix="%",hint}){
  const pct = ((value-min)/(max-min))*100;
  return(
    <div style={{marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"8px"}}>
        {label&&<label style={{fontSize:"12px",fontWeight:600,color:C.muted,letterSpacing:"0.03em"}}>{label}</label>}
        <span style={{fontSize:"15px",fontWeight:700,color:C.accent,fontVariantNumeric:"tabular-nums"}}>{value}{suffix}</span>
      </div>
      <div style={{position:"relative",height:"24px",display:"flex",alignItems:"center"}}>
        <div style={{position:"absolute",left:0,right:0,height:"5px",background:C.border,borderRadius:"3px"}}/>
        <div style={{position:"absolute",left:0,width:`${pct}%`,height:"5px",background:C.accent,borderRadius:"3px"}}/>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}
          style={{width:"100%",appearance:"none",background:"transparent",position:"relative",zIndex:2,cursor:"pointer",height:"24px"}}/>
        <style>{`
          input[type=range]::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:${C.white};border:3px solid ${C.accent};box-shadow:0 2px 6px rgba(99,102,241,.3);cursor:pointer;}
          input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:${C.white};border:3px solid ${C.accent};box-shadow:0 2px 6px rgba(99,102,241,.3);cursor:pointer;}
        `}</style>
      </div>
      {hint&&<p style={{fontSize:"11px",color:C.mutedLight,marginTop:"4px"}}>{hint}</p>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// SUPABASE SETUP SCREEN
// ═══════════════════════════════════════════════════════
function SupabaseSetup({onSave}){
  const [url,setUrl]=useState(""), [key,setKey]=useState("");
  const [ld,setLd]=useState(false), [err,setErr]=useState("");
  const [showSchema,setShowSchema]=useState(false);

  const handle=async()=>{
    const u = url.trim().replace(/\/+$/, "");
    const k = key.trim();
    if(!u||!k){setErr("Preencha os dois campos.");return;}
    // Validate URL format
    if(!u.startsWith("https://")||!u.includes("supabase.co")){
      setErr("URL inválida. Deve ser: https://xxxx.supabase.co");return;
    }
    // Validate key format (JWT starts with eyJ)
    if(!k.startsWith("eyJ")){
      setErr("Chave inválida. Copie a chave 'anon public' no Supabase → Settings → API.");return;
    }
    setLd(true);
    await window.storage.set("vero:sb_url", u);
    await window.storage.set("vero:sb_key", k);
    onSave(u, k);
    setLd(false);
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{maxWidth:"420px",width:"100%"}} className="fade-up">
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <MiraLogo size={28}/>
          <h2 style={{fontSize:"18px",fontWeight:800,color:C.text,marginTop:"20px"}}>Conectar banco de dados</h2>
          <p style={{color:C.muted,fontSize:"13.5px",marginTop:"6px",lineHeight:1.6}}>
            Crie um projeto gratuito em{" "}
            <span style={{color:C.accent,fontWeight:600}}>supabase.com</span>{" "}
            e cole as credenciais abaixo.
          </p>
        </div>

        <div style={{background:C.white,borderRadius:"14px",padding:"24px",border:`1px solid ${C.border}`,marginBottom:"12px"}}>
          <FInput label="Project URL" value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" hint="Settings → API → Project URL"/>
          <FInput label="Anon / Public Key" value={key} onChange={setKey} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." hint="Settings → API → Project API Keys → anon public" type="password"/>
          {err&&<p style={{color:C.danger,fontSize:"12px",marginBottom:"10px"}}>{err}</p>}
          <button onClick={handle} disabled={ld} className="btn" style={{width:"100%",background:ld?C.border:C.accent,color:C.white,borderRadius:"8px",padding:"12px",fontSize:"14px",fontWeight:600,cursor:ld?"not-allowed":"pointer"}}>
            {ld?"Conectando…":"Conectar"}
          </button>
        </div>

        <button onClick={()=>setShowSchema(!showSchema)} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:"10px",padding:"11px",fontSize:"12.5px",color:C.muted,cursor:"pointer",fontWeight:500}}>
          {showSchema?"Ocultar SQL do schema ↑":"Ver SQL para rodar no Supabase ↓"}
        </button>

        {showSchema&&(
          <div style={{background:C.primary,borderRadius:"10px",padding:"14px",marginTop:"8px",maxHeight:"300px",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <span style={{color:"rgba(255,255,255,.5)",fontSize:"10.5px",fontWeight:600,letterSpacing:"0.05em"}}>SQL EDITOR → New query → Cole e execute</span>
              <button onClick={()=>{navigator.clipboard.writeText(VERO_SCHEMA);}} style={{background:"rgba(99,102,241,.3)",border:"none",color:"rgba(255,255,255,.8)",borderRadius:"6px",padding:"4px 10px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>Copiar</button>
            </div>
            <pre style={{color:"rgba(255,255,255,.7)",fontSize:"10.5px",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{VERO_SCHEMA.trim()}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// AUTH SCREEN (Login / Cadastro)
// ═══════════════════════════════════════════════════════
function AuthScreen({sb, onAuth}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""), [pw,setPw]=useState(""), [pw2,setPw2]=useState("");
  const [ld,setLd]=useState(false), [err,setErr]=useState(""), [ok,setOk]=useState("");

  const handle=async()=>{
    if(!email||!pw){setErr("Preencha todos os campos.");return;}
    if(mode==="signup"&&pw!==pw2){setErr("As senhas não coincidem.");return;}
    if(pw.length<6){setErr("Senha deve ter mínimo 6 caracteres.");return;}
    setLd(true);setErr("");setOk("");
    try{
      if(mode==="signup"){
        const res=await sb.signUp(email,pw);
        if(res.error){
          const msg=res.error.message||"";
          if(msg.includes("already registered")) setErr("Este email já tem conta. Faça login.");
          else setErr(msg||"Erro ao criar conta.");
          return;
        }
        // Supabase v2: { user: {...}, session: null|{...} }
        const user = res.user || res;
        // Token pode estar em res.access_token (confirmação desativada)
        // ou em res.session.access_token (confirmação ativada com auto-login)
        const token = res.access_token || res.session?.access_token;
        if(user?.id || token){
          if(token){
            // Conta criada e logada direto
            await window.storage.set("vero:auth_token",token);
            await window.storage.set("vero:user_email",email);
            onAuth(token, email);
          } else {
            // Criada mas aguarda confirmação de email
            setOk("✓ Conta criada! Agora faça login.");
            setMode("login");
          }
        } else {
          // Mostrar resposta crua para debug
          setErr("Erro: " + JSON.stringify(res).slice(0,120));
        }
      } else {
        const res=await sb.signIn(email,pw);
        if(res.error){
          const msg=res.error.message||"";
          if(msg.includes("Invalid login credentials")) setErr("Email ou senha incorretos.");
          else if(msg.includes("Email not confirmed")) setErr("Confirme seu email antes de entrar — ou desative a confirmação em Authentication → Providers → Email no Supabase.");
          else setErr(msg||"Erro ao entrar.");
          return;
        }
        if(res.access_token){
          await window.storage.set("vero:auth_token",res.access_token);
          await window.storage.set("vero:user_email",email);
          onAuth(res.access_token, email);
        } else {
          setErr("Resposta inesperada. Tente novamente.");
        }
      }
    }catch(e){
      console.error("Auth error:",e);
      setErr("Erro de conexão. Verifique URL e chave do Supabase.");
    }
    setLd(false);
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{maxWidth:"380px",width:"100%"}} className="fade-up">
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <MiraLogo size={26}/>
          <p style={{color:C.muted,fontSize:"14px",marginTop:"14px"}}>
            {mode==="login"?"Bem-vindo de volta":"Criar sua conta Vero"}
          </p>
        </div>

        <div style={{background:C.white,borderRadius:"14px",padding:"24px",border:`1px solid ${C.border}`,boxShadow:"0 4px 16px rgba(0,0,0,.04)"}}>
          {ok&&<div style={{background:C.successLight,border:`1px solid ${C.successBorder}`,borderRadius:"8px",padding:"10px 12px",marginBottom:"14px",fontSize:"12.5px",color:C.success,fontWeight:500}}>{ok}</div>}
          <FInput label="Email" value={email} onChange={setEmail} placeholder="voce@email.com" type="email"/>
          <FInput label="Senha" value={pw} onChange={setPw} placeholder="Mínimo 6 caracteres" type="password"/>
          {mode==="signup"&&<FInput label="Confirmar senha" value={pw2} onChange={setPw2} placeholder="Repita a senha" type="password"/>}
          {err&&<p style={{color:C.danger,fontSize:"12px",marginBottom:"10px"}}>{err}</p>}
          <button onClick={handle} disabled={ld} className="btn" style={{width:"100%",background:ld?C.border:C.accent,color:ld?C.muted:C.white,borderRadius:"8px",padding:"12px",fontSize:"14px",fontWeight:600,cursor:ld?"not-allowed":"pointer",marginBottom:"12px"}}>
            {ld?"…":mode==="login"?"Entrar":"Criar conta"}
          </button>
          <p style={{textAlign:"center",fontSize:"13px",color:C.muted}}>
            {mode==="login"?"Não tem conta?":"Já tem conta?"}{" "}
            <button onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");setOk("");}} style={{background:"none",border:"none",color:C.accent,fontWeight:600,cursor:"pointer",fontSize:"13px"}}>
              {mode==="login"?"Criar agora":"Fazer login"}
            </button>
          </p>
        </div>

        <div style={{background:C.accentLight,border:`1px solid ${C.accentBorder}`,borderRadius:"10px",padding:"12px 14px",marginTop:"10px"}}>
          <p style={{fontSize:"11.5px",color:C.primary,lineHeight:1.65}}>
            <b>Problemas ao criar conta?</b><br/>
            No Supabase: <b>Authentication → Providers → Email</b> → desative <b>"Confirm email"</b> → Save.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// LANDING
// ═══════════════════════════════════════════════════════
function Landing({onStart}){
  const [v,setV]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setV(true),60);return()=>clearTimeout(t);},[]);
  const d=n=>({opacity:v?1:0,transform:v?"translateY(0)":"translateY(14px)",transition:`opacity .6s ease ${n}s,transform .6s ease ${n}s`});
  return(
    <div style={{minHeight:"100vh",background:C.primary,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"56px 28px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",backgroundImage:`linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px)`,backgroundSize:"40px 40px"}}/>
      <div style={{position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:"500px",height:"300px",background:"radial-gradient(ellipse,rgba(99,102,241,.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{...d(.1),marginBottom:"20px"}}><MiraLogo size={36} dark={false}/></div>
      <div style={{...d(.25),textAlign:"center",marginBottom:"56px"}}>
        <p style={{color:"rgba(255,255,255,.38)",fontSize:"14px",letterSpacing:"0.04em"}}>Seu negócio responde no tempo certo.</p>
      </div>
      <div style={{...d(.4),display:"flex",flexDirection:"column",gap:"11px",maxWidth:"320px",width:"100%",marginBottom:"56px"}}>
        {[
          {icon:"◈",text:"Responde seus clientes automaticamente"},
          {icon:"◷",text:"Agenda, confirma e lembra compromissos"},
          {icon:"◎",text:"Reativa clientes inativos no momento certo"},
          {icon:"◉",text:"Resume seu negócio todo dia com IA"},
        ].map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:"14px",opacity:v?1:0,transform:v?"translateX(0)":"translateX(-12px)",transition:`opacity .5s ease ${.5+i*.08}s,transform .5s ease ${.5+i*.08}s`}}>
            <span style={{color:C.accent,fontSize:"14px",flexShrink:0}}>{f.icon}</span>
            <span style={{color:"rgba(255,255,255,.55)",fontSize:"13.5px"}}>{f.text}</span>
          </div>
        ))}
      </div>
      <div style={d(.85)}>
        <button onClick={onStart} className="btn" style={{background:C.accent,color:"#fff",borderRadius:"10px",padding:"14px 44px",fontSize:"15px",fontWeight:600,boxShadow:"0 0 0 1px rgba(99,102,241,.5),0 8px 28px rgba(99,102,241,.35)"}}>
          Começar gratuitamente
        </button>
        <p style={{color:"rgba(255,255,255,.22)",fontSize:"11.5px",textAlign:"center",marginTop:"14px"}}>Sem cartão de crédito. Configura em 5 minutos.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// API SETUP
// ═══════════════════════════════════════════════════════
function ApiSetup({onSave}){
  const [key,setKey]=useState(""), [ld,setLd]=useState(false), [err,setErr]=useState("");
  const handle=async()=>{
    const k = key.trim();
    if(!k){setErr("Insira a chave de API.");return;}
    if(!k.startsWith("sk-ant-")){setErr("Formato inválido. A chave começa com sk-ant-...");return;}
    // Skip live test — just validate format and save
    onSave(k);
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{maxWidth:"400px",width:"100%"}} className="fade-up">
        <div style={{textAlign:"center",marginBottom:"40px"}}>
          <MiraLogo size={26}/>
          <p style={{color:C.muted,fontSize:"14px",marginTop:"16px"}}>Insira sua chave de API para continuar</p>
        </div>
        <div style={{background:C.white,borderRadius:"14px",padding:"28px",border:`1px solid ${C.border}`,boxShadow:"0 4px 16px rgba(0,0,0,.04)"}}>
          <label style={{display:"block",fontSize:"12px",fontWeight:600,color:C.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"8px"}}>Chave de API — Anthropic</label>
          <input type="password" value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="sk-ant-api03-…"
            style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${err?C.danger:C.border}`,borderRadius:"8px",fontSize:"14px",outline:"none",background:C.surface,color:C.text}}
            onFocus={e=>{e.target.style.borderColor=C.accent;}} onBlur={e=>{e.target.style.borderColor=err?C.danger:C.border;}}/>
          {err&&<p style={{color:C.danger,fontSize:"12px",marginTop:"6px"}}>{err}</p>}
          <p style={{color:C.mutedLight,fontSize:"12px",marginTop:"10px",lineHeight:1.6}}>Sua chave é armazenada localmente e nunca compartilhada. <span style={{color:C.accent}}>console.anthropic.com</span></p>
          <button onClick={handle} disabled={ld} className="btn" style={{width:"100%",marginTop:"20px",background:ld?C.border:C.accent,color:ld?C.muted:C.white,borderRadius:"8px",padding:"12px",fontSize:"14px",fontWeight:600,cursor:ld?"not-allowed":"pointer"}}>
            {ld?"Verificando…":"Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════
function Onboarding({apiKey,onComplete}){
  const [msgs,setMsgs]=useState([]), [input,setInput]=useState(""), [ld,setLd]=useState(false), [done,setDone]=useState(false);
  const ref=useRef(null);
  const SYS=`Você é a Vero, assistente para profissionais de saúde e bem-estar brasileiros. Colete conversacionalmente: 1.Nome e área 2.Serviços e valores 3.Horários 4.Política cancelamento 5.Tom(informal/formal/descontraído) 6.Emoji(sim/às vezes/não) 7.Tratamento(primeiro nome/você formal/senhor-senhora). 1-2 infos por mensagem. Quando tiver tudo: PRONTO{"nome":"","area":"","servicos":[],"horarios":"","cancelamento":"","tom":"","emoji":"","tratamento":""}`;
  useEffect(()=>{
    (async()=>{setLd(true);try{const r=await claude(apiKey,[{role:"user",content:"Acabei de criar minha conta."}],SYS,180);setMsgs([{role:"assistant",content:r}]);}catch{setMsgs([{role:"assistant",content:"Olá! Sou a Vero. Vamos configurar em 5 minutos. Qual o seu nome e área?"}]);}setLd(false);})();
  },[]);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[msgs,ld]);
  const send=async()=>{
    if(!input.trim()||ld)return;
    const u={role:"user",content:input.trim()},next=[...msgs,u];
    setMsgs(next);setInput("");setLd(true);
    try{
      const r=await claude(apiKey,next.map(m=>({role:m.role,content:m.content})),SYS,400);
      if(r.includes("PRONTO")){
        const jM=r.match(/\{[\s\S]*\}/),clean=r.replace("PRONTO","").replace(jM?.[0]||"","").trim();
        setMsgs([...next,{role:"assistant",content:clean||"Perfeito! Preparando seu painel…"}]);setDone(true);
        let dna={nome:"",area:"",tom:"informal",emoji:"às vezes",tratamento:"primeiro nome"};
        if(jM){try{dna={...dna,...JSON.parse(jM[0])};}catch{}}
        setTimeout(()=>onComplete(dna),1600);
      }else{setMsgs([...next,{role:"assistant",content:r}]);}
    }catch{setMsgs([...next,{role:"assistant",content:"Tive um problema. Pode repetir?"}]);}
    setLd(false);
  };
  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",maxWidth:"520px",margin:"0 auto"}}>
      <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:C.white}}>
        <MiraLogo size={20}/>
        <span style={{background:C.accentLight,color:C.accent,fontSize:"11px",fontWeight:600,padding:"3px 10px",borderRadius:"20px"}}>Configuração inicial — Vero</span>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"24px 16px",display:"flex",flexDirection:"column",gap:"14px",background:C.surface}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",gap:"10px",alignItems:"flex-end"}}>
            {m.role==="assistant"&&<MiraIcon size={32}/>}
            <div style={{maxWidth:"78%",background:m.role==="user"?C.primary:C.white,color:m.role==="user"?C.white:C.text,borderRadius:m.role==="user"?"14px 14px 3px 14px":"14px 14px 14px 3px",padding:"11px 15px",fontSize:"14px",lineHeight:1.65,border:m.role==="assistant"?`1px solid ${C.border}`:"none",whiteSpace:"pre-line"}}>
              {m.content}
            </div>
          </div>
        ))}
        {ld&&(<div style={{display:"flex",alignItems:"flex-end",gap:"10px"}}><MiraIcon size={32}/><div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:"14px 14px 14px 3px",padding:"14px 16px"}}><Dots/></div></div>)}
      </div>
      {!done&&(
        <div style={{padding:"12px 16px 20px",background:C.white,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",gap:"8px"}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Escreva sua resposta…"
              style={{flex:1,padding:"11px 14px",border:`1.5px solid ${C.border}`,borderRadius:"8px",fontSize:"14px",outline:"none",background:C.surface,color:C.text}}
              onFocus={e=>{e.target.style.borderColor=C.accent;}} onBlur={e=>{e.target.style.borderColor=C.border;}}/>
            <button onClick={send} disabled={ld||!input.trim()} className="btn" style={{background:(!ld&&input.trim())?C.accent:C.border,color:C.white,borderRadius:"8px",padding:"11px 18px",fontSize:"14px",fontWeight:600,cursor:(!ld&&input.trim())?"pointer":"not-allowed"}}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
function MainApp({apiKey,dna,sb,authToken,userEmail,onReset}){
  const [view,setView]=useState("dashboard");
  const [toast,setToast]=useState(null);

  // Dashboard
  const [briefing,setBriefing]=useState(""), [bLd,setBLd]=useState(false);

  // Clients/leads
  const [filter,setFilter]=useState("todos");
  const [activeC,setActiveC]=useState(null), [aiMsg,setAiMsg]=useState(""), [msgLd,setMsgLd]=useState(false), [copied,setCopied]=useState(false);
  const [showLeads,setShowLeads]=useState(true);

  // Inbox — real-time conversations
  const [convs,setConvs] = useState(MOCK_CONVERSATIONS);
  const [channelFilter,setChannelFilter] = useState("todos");
  const [openConv,setOpenConv] = useState(null); // conversation id
  const [replyText,setReplyText] = useState("");
  const [learning,setLearning] = useState(false);
  const [learnedCount,setLearnedCount] = useState(LEARNED_PATTERNS.length);
  const [aiDraft,setAiDraft] = useState("");
  const [draftLd,setDraftLd] = useState(false);
  const convScrollRef = useRef(null);

  // Settings
  const [tom,setTom]               = useState(dna?.tom        || "informal");
  const [emoji,setEmoji]           = useState(dna?.emoji      || "às vezes");
  const [tratamento,setTratamento] = useState(dna?.tratamento || "primeiro nome");
  const [limits,setLimits] = useState({
    confirmar:true,precos:true,lembretes:true,avaliacoes:true,
    descontos:true,cancelar:false,reclamacoes:false,
  });
  const toggleLimit = k => {
    const updated = {...limits,[k]:!limits[k]};
    setLimits(updated);
    showToast("Configuração salva");
    if(sb&&authToken) sb.upsert("settings",authToken,{profile_id:null,limits:JSON.stringify(updated),updated_at:new Date().toISOString()}).catch(()=>{});
  };

  const [maxDiscount,setMaxDiscount] = useState(15);
  const [autoLearn,setAutoLearn] = useState(true);

  const [wp,setWp] = useState({tipo:"business",numero:"+55 21 98765-4321",conectado:true,provedor:"Meta Cloud API"});
  const [em,setEm] = useState({email:"dra.ana@gmail.com",conectado:true,provedor:"Gmail"});

  const [per,setPer_] = useState({
    saudacao:"Oi", despedida:"Um abraço", assinatura:"",
    followDias:"30", reativDias:"45",
    msgBemVindo:"", msgPosAtend:"", msgReativacao:"", googleLink:"g.page/r/dra-ana/review",
  });
  const setPer = (k,v) => setPer_(p=>({...p,[k]:v}));

  const firstName = (dna?.nome||"").split(" ")[0]||"você";
  const stats = {
    ativos: MOCK_CLIENTS.filter(c=>c.status==="ativo").length,
    atencao:MOCK_CLIENTS.filter(c=>c.status==="risco"||c.status==="alerta").length,
    mrr:    MOCK_CLIENTS.filter(c=>c.status==="ativo").reduce((s,c)=>s+c.mrr,0),
  };
  const unreadCount = convs.filter(c=>c.unread>0||c.status==="needs_approval"||c.status==="needs_attention").length;

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(null),2600);}

  const genBriefing = async()=>{
    setBLd(true);
    const sys=`Você é a Vero. Briefing matinal para ${dna?.nome||"o profissional"} (${dna?.area||"saúde"}). Tom: ${tom}. Primeiro nome. Estruture em: 📅 AGENDA, ⚠️ ATENÇÃO, 💡 OPORTUNIDADE. Com nomes e números. Sem asteriscos. Máx 200 palavras.`;
    const ctx=`Data: ${todayStr}\nAgenda: ${MOCK_AGENDA.map(a=>`${a.time} ${a.client} [${a.confirmed?"confirmado":"aguardando"}]`).join(", ")}\nAtenção: Ana Paula respondeu à reativação (43 dias), Roberto enviou reclamação, Juliana pediu 20% desconto\nLeads hoje: Maria Clara agendou, Patrícia em aquecimento\nMRR: R$${stats.mrr.toLocaleString("pt-BR")}`;
    try{const r=await claude(apiKey,[{role:"user",content:ctx}],sys,350);setBriefing(r);}
    catch{setBriefing("Hoje você tem 5 compromissos. A Ana Paula respondeu à reativação depois de 43 dias — ótima oportunidade. O Roberto enviou uma mensagem que pode ser uma reclamação e está aguardando você. A Juliana pediu 20% de desconto no pacote, acima do seu limite. E a Maria Clara virou cliente nova hoje via Instagram! MRR ativo: R$3.560.");}
    setBLd(false);
  };

  const genReactivation = async c=>{
    setActiveC(c);setAiMsg("");setMsgLd(true);
    const sys=`Você é assistente de ${dna?.nome||"um profissional"}. UMA mensagem WhatsApp para reativar ${c.name}. Tom: ${tom}. ${emoji==="sim"?"Use 1 emoji.":"Sem emojis."} Trate pelo ${tratamento}. Natural, não automático. Máx 3 frases. Sem asteriscos.`;
    try{const r=await claude(apiKey,[{role:"user",content:`${c.name}, ${c.area}, ${c.days} dias sem contato, ${c.sessions} sessões`}],sys,120);setAiMsg(r);}
    catch{setAiMsg(`Oi ${c.name.split(" ")[0]}, tudo bem? Faz um tempinho! Quando quiser marcar é só falar.`);}
    setMsgLd(false);
  };

  const copyMsg = ()=>{ navigator.clipboard.writeText(aiMsg).then(()=>{setCopied(true);showToast("Mensagem copiada!");setTimeout(()=>setCopied(false),2000);}); };

  // Inbox actions
  const openConversation = (id) => {
    setOpenConv(id);
    setConvs(cs=>cs.map(c=>c.id===id?{...c,unread:0}:c));
    setAiDraft("");
    setReplyText("");
  };

  const closeConversation = () => { setOpenConv(null); setReplyText(""); setAiDraft(""); };

  const approveDiscount = (convId) => {
    setConvs(cs=>cs.map(c=>{
      if(c.id!==convId) return c;
      const lastMsg = c.messages[c.messages.length-1];
      if(!lastMsg.pending) return c;
      const newMsgs = c.messages.filter(m=>!m.pending).concat([
        {from:"ai", text:`Consegui sim Juliana! Vou aplicar os 20% pra você. Fica R$1.120 no pacote fechado. Quando quiser começar é só avisar 💛`, time:"agora"}
      ]);
      return {...c, messages:newMsgs, status:"auto_replied", summary:"Desconto aprovado — 20% aplicado"};
    }));
    showToast("Desconto aprovado. IA enviou a mensagem.");
  };

  const rejectDiscount = (convId) => {
    setConvs(cs=>cs.map(c=>{
      if(c.id!==convId) return c;
      const newMsgs = c.messages.filter(m=>!m.pending).concat([
        {from:"ai", text:`Juliana, o máximo que consigo aplicar é 15% nesse pacote, fica R$1.190. É o melhor valor possível pra esse mês. Topa?`, time:"agora"}
      ]);
      return {...c, messages:newMsgs, status:"auto_replied", summary:"Contra-oferta enviada (15%)"};
    }));
    showToast("Contra-oferta enviada com limite máximo.");
  };

  const generateAiDraft = async (conv) => {
    setDraftLd(true);
    const sys = `Você é a Vero, assistente de ${dna?.nome||"um profissional de saúde"}. Escreva UMA resposta WhatsApp curta e natural para o cliente. Tom: ${tom}. ${emoji==="sim"?"1 emoji se fizer sentido.":"Sem emojis."} Trate pelo ${tratamento}. Máx 2 frases. Sem asteriscos. Use saudação "${per.saudacao}" se for início.`;
    const context = conv.messages.slice(-4).map(m=>`${m.from==="client"?"Cliente":"Vero"}: ${m.text}`).join("\n");
    try{
      const r = await claude(apiKey, [{role:"user", content:`Contexto:\n${context}\n\nEscreva a resposta da Vero agora.`}], sys, 150);
      setAiDraft(r.trim());
    } catch {
      setAiDraft("");
      showToast("Não consegui gerar sugestão agora");
    }
    setDraftLd(false);
  };

  const sendUserReply = () => {
    if(!replyText.trim() || !openConv) return;
    setConvs(cs=>cs.map(c=>{
      if(c.id!==openConv) return c;
      return {...c, messages:[...c.messages, {from:"user", text:replyText.trim(), time:"agora"}], status:"user_replied", summary:"Você respondeu"};
    }));
    if(autoLearn){
      setLearning(true);
      setTimeout(()=>{
        setLearning(false);
        setLearnedCount(n=>n+1);
        showToast("Vero aprendeu um novo padrão do seu estilo ✨");
      }, 1600);
    }
    setReplyText("");
    setAiDraft("");
  };

  const useAiDraft = () => {
    setReplyText(aiDraft);
    setAiDraft("");
  };

  useEffect(()=>{
    if(convScrollRef.current) convScrollRef.current.scrollTop = convScrollRef.current.scrollHeight;
  }, [openConv, convs]);

  const currentConv = convs.find(c=>c.id===openConv);

  const filtered = filter==="todos"?MOCK_CLIENTS:MOCK_CLIENTS.filter(c=>c.status===filter);
  const channelFiltered = convs.filter(c=>channelFilter==="todos" || c.channel===channelFilter);

  const NAV=[
    {id:"dashboard",label:"Início",  icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>},
    {id:"inbox",    label:"Inbox",   icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>, badge:unreadCount},
    {id:"clients",  label:"Clientes",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>},
    {id:"schedule", label:"Agenda",  icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>},
    {id:"settings", label:"Config",  icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.surface,fontFamily:"'Plus Jakarta Sans',sans-serif",maxWidth:"480px",margin:"0 auto",display:"flex",flexDirection:"column",position:"relative"}}>

      {toast&&(<div style={{position:"fixed",top:"68px",left:"50%",transform:"translateX(-50%)",background:C.primary,color:C.white,padding:"9px 18px",borderRadius:"20px",fontSize:"13px",fontWeight:500,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,.15)",animation:"fadeUp .25s ease",maxWidth:"92%",textAlign:"center"}}>{toast}</div>)}

      <div style={{background:C.white,padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100,flexShrink:0}}>
        <MiraLogo size={20}/>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {(wp.conectado||em.conectado) && (
            <div style={{display:"flex",alignItems:"center",gap:"5px",background:C.successLight,padding:"4px 10px",borderRadius:"12px",border:`1px solid ${C.successBorder}`}}>
              <div className="pulse-dot" style={{width:"6px",height:"6px",borderRadius:"50%",background:C.success}}/>
              <span style={{fontSize:"10.5px",fontWeight:600,color:C.success}}>ativa</span>
            </div>
          )}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"13px",fontWeight:600,color:C.text}}>{firstName}</div>
            <div style={{fontSize:"10.5px",color:C.mutedLight,textTransform:"capitalize"}}>{new Date().toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})}</div>
          </div>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",paddingBottom:"72px"}}>

        {/* ══════════════════════════ DASHBOARD ══════════════════════════ */}
        {view==="dashboard"&&(
          <div style={{padding:"16px"}}>
            {/* Live stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"16px"}}>
              {[
                {label:"Ativos", val:stats.ativos, color:C.success},
                {label:"Atenção",val:stats.atencao,color:C.warning},
                {label:"Leads", val:MOCK_LEADS.length,color:C.accent},
                {label:"MRR",   val:`${(stats.mrr/1000).toFixed(1)}k`,color:C.primary},
              ].map((s,i)=>(
                <div key={i} style={{background:C.white,borderRadius:"10px",padding:"12px 6px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                  <div style={{fontSize:"18px",fontWeight:800,color:s.color,letterSpacing:"-0.03em"}}>{s.val}</div>
                  <div style={{fontSize:"9.5px",color:C.muted,marginTop:"2px",fontWeight:500}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Briefing */}
            <div style={{background:C.primary,borderRadius:"14px",padding:"20px",marginBottom:"14px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-40,right:-40,width:"150px",height:"150px",borderRadius:"50%",background:"rgba(99,102,241,.15)"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px"}}>
                <div>
                  <div style={{color:"rgba(255,255,255,.4)",fontSize:"10.5px",letterSpacing:"0.07em",marginBottom:"4px",fontWeight:600}}>BRIEFING DO DIA</div>
                  <div style={{color:C.white,fontSize:"15px",fontWeight:700}}>Bom dia, {firstName} 👋</div>
                </div>
                <button onClick={genBriefing} disabled={bLd} className="btn" style={{background:"rgba(99,102,241,.3)",color:"rgba(255,255,255,.85)",border:"1px solid rgba(99,102,241,.4)",borderRadius:"7px",padding:"7px 13px",fontSize:"12px",fontWeight:600,flexShrink:0}}>
                  {bLd?"…":briefing?"↺":"✦ Gerar"}
                </button>
              </div>
              {bLd&&<Dots/>}
              {briefing&&!bLd&&<p style={{color:"rgba(255,255,255,.75)",fontSize:"13px",lineHeight:1.75,whiteSpace:"pre-line"}}>{briefing}</p>}
              {!briefing&&!bLd&&<p style={{color:"rgba(255,255,255,.25)",fontSize:"13px",fontStyle:"italic"}}>Clique em "✦ Gerar" para ver o resumo do seu dia</p>}
            </div>

            {/* Urgent attention items */}
            {(convs.some(c=>c.status==="needs_approval") || convs.some(c=>c.status==="needs_attention")) && (
              <div style={{background:C.dangerLight,border:`1px solid ${C.dangerBorder}`,borderRadius:"12px",padding:"14px",marginBottom:"14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
                  <div className="pulse-dot" style={{width:"8px",height:"8px",borderRadius:"50%",background:C.danger}}/>
                  <span style={{fontSize:"12px",fontWeight:700,color:C.danger,letterSpacing:"0.04em"}}>PRECISA DE VOCÊ</span>
                </div>
                {convs.filter(c=>c.status==="needs_approval"||c.status==="needs_attention").map(c=>(
                  <button key={c.id} onClick={()=>{setView("inbox");setTimeout(()=>openConversation(c.id),100);}} className="btn" style={{width:"100%",background:C.white,border:`1px solid ${C.dangerBorder}`,borderRadius:"9px",padding:"10px 12px",display:"flex",alignItems:"center",gap:"10px",textAlign:"left",marginBottom:"6px"}}>
                    <div style={{width:"32px",height:"32px",borderRadius:"8px",background:C.dangerLight,color:C.danger,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,flexShrink:0}}>{c.ini}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12.5px",fontWeight:600,color:C.text}}>{c.name}</div>
                      <div style={{fontSize:"11px",color:C.danger,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.summary}</div>
                    </div>
                    <span style={{color:C.danger,fontSize:"14px"}}>→</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mira learning */}
            <div style={{background:`linear-gradient(135deg, ${C.accentLight} 0%, #F5F3FF 100%)`,border:`1px solid ${C.accentBorder}`,borderRadius:"12px",padding:"14px",marginBottom:"14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span style={{fontSize:"15px"}}>✨</span>
                  <span style={{fontSize:"12px",fontWeight:700,color:C.accentMid||C.accent,letterSpacing:"0.04em"}}>VERO ESTÁ APRENDENDO</span>
                </div>
                <span style={{background:C.white,color:C.accent,fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"10px",border:`1px solid ${C.accentBorder}`}}>{learnedCount} padrões</span>
              </div>
              <p style={{fontSize:"12px",color:C.primary,lineHeight:1.6,marginBottom:"10px"}}>
                Cada mensagem sua ensina a Vero. Ela já aprendeu sua saudação, despedida típica, uso de emoji, horários de resposta e muito mais.
              </p>
              <button onClick={()=>setView("settings")} className="btn" style={{background:"transparent",color:C.accent,fontSize:"11.5px",fontWeight:600,padding:0,textDecoration:"underline"}}>
                Ver o que a Vero aprendeu →
              </button>
            </div>

            {/* Automation log */}
            <Card title="O QUE A VERO FEZ HOJE" action={<span style={{fontSize:"10.5px",color:C.success,fontWeight:600,display:"flex",alignItems:"center",gap:"5px"}}><div className="pulse-dot" style={{width:"6px",height:"6px",borderRadius:"50%",background:C.success}}/>ao vivo</span>}>
              <div style={{display:"flex",flexDirection:"column"}}>
                {MOCK_AUTOMATIONS.slice(0,7).map((a,i)=>(
                  <div key={i} className="slide-in" style={{display:"flex",alignItems:"flex-start",gap:"10px",paddingBottom:"10px",marginBottom:"10px",borderBottom:i<6?`1px solid ${C.border}`:"none",animationDelay:`${i*.05}s`}}>
                    <div style={{width:"28px",height:"28px",borderRadius:"8px",background:a.type==="flag"?C.dangerLight:a.type==="lead"?C.accentLight:a.type==="review"?C.warningLight:C.successLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"12px"}}>
                      {a.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:"8px"}}>
                        <span style={{fontSize:"12.5px",fontWeight:600,color:C.text}}>{a.title}</span>
                        <span style={{fontSize:"10.5px",color:C.mutedLight,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{a.time}</span>
                      </div>
                      <div style={{fontSize:"11.5px",color:C.muted,marginTop:"2px",lineHeight:1.5}}>{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={()=>showToast("Ver histórico completo — em breve")} className="btn" style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:"8px",padding:"9px",fontSize:"12px",color:C.muted,fontWeight:500,marginTop:"6px"}}>
                Ver histórico completo
              </button>
            </Card>

            {/* Agenda preview */}
            <Card title="AGENDA DE HOJE" action={<button onClick={()=>setView("schedule")} style={{background:"none",border:"none",color:C.accent,fontSize:"11.5px",fontWeight:600,cursor:"pointer"}}>Ver tudo →</button>}>
              <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
                {MOCK_AGENDA.slice(0,3).map(a=>(
                  <div key={a.id} style={{background:C.surface,borderRadius:"9px",padding:"10px 12px",display:"flex",alignItems:"center",gap:"11px"}}>
                    <span style={{background:a.confirmed?C.successLight:C.warningLight,color:a.confirmed?C.success:C.warning,borderRadius:"6px",padding:"3px 8px",fontSize:"11.5px",fontWeight:700,minWidth:"42px",textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{a.time}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12.5px",fontWeight:600,color:C.text}}>{a.client}</div>
                      <div style={{fontSize:"10.5px",color:C.muted}}>{a.service}</div>
                    </div>
                    <div style={{width:"7px",height:"7px",borderRadius:"50%",background:a.confirmed?C.success:C.warning}}/>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════ INBOX ══════════════════════════ */}
        {view==="inbox" && !openConv && (
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
              <h2 style={{fontSize:"17px",fontWeight:800,color:C.text}}>Inbox</h2>
              <span style={{fontSize:"12px",color:C.muted,fontWeight:500}}>{convs.length} conversas</span>
            </div>

            {/* Channel filter */}
            <div style={{display:"flex",gap:"7px",marginBottom:"14px"}}>
              {[
                {id:"todos",    label:"Todos",   count:convs.length},
                {id:"whatsapp", label:"WhatsApp",count:convs.filter(c=>c.channel==="whatsapp").length},
                {id:"email",    label:"Email",   count:convs.filter(c=>c.channel==="email").length},
              ].map(f=>(
                <button key={f.id} onClick={()=>setChannelFilter(f.id)} className="btn"
                  style={{flex:1,background:channelFilter===f.id?C.primary:C.white,color:channelFilter===f.id?C.white:C.muted,border:`1px solid ${channelFilter===f.id?C.primary:C.border}`,borderRadius:"10px",padding:"9px 10px",fontSize:"12px",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"all .15s"}}>
                  {f.id==="whatsapp" && <WhatsAppIcon size={12}/>}
                  {f.id==="email"    && <EmailIcon size={12}/>}
                  {f.label} <span style={{opacity:.6}}>·</span> {f.count}
                </button>
              ))}
            </div>

            {/* Conversation list */}
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {channelFiltered.map(c=>{
                const last = c.messages[c.messages.length-1];
                const isFlagged = c.status==="needs_approval" || c.status==="needs_attention";
                const statusLabel = {
                  auto_replied:   {text:"Vero respondeu",   color:C.success, bg:C.successLight},
                  needs_approval: {text:"Precisa aprovar",  color:C.warning, bg:C.warningLight},
                  needs_attention:{text:"Precisa atenção",  color:C.danger,  bg:C.dangerLight },
                  user_replied:   {text:"Você respondeu",   color:C.muted,   bg:C.surface     },
                }[c.status] || {text:"",color:C.muted,bg:C.surface};

                return(
                  <button key={c.id} onClick={()=>openConversation(c.id)} className="btn"
                    style={{background:C.white,border:`1px solid ${isFlagged?statusLabel.color:C.border}`,borderRadius:"12px",padding:"14px",textAlign:"left",position:"relative",borderLeft:`3px solid ${statusLabel.color}`,display:"block",width:"100%"}}>
                    <div style={{display:"flex",gap:"11px",alignItems:"flex-start"}}>
                      <div style={{position:"relative",flexShrink:0}}>
                        <div style={{width:"42px",height:"42px",borderRadius:"10px",background:c.channel==="whatsapp"?C.whatsappLight:C.emailLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:700,color:c.channel==="whatsapp"?C.whatsapp:C.email}}>
                          {c.ini}
                        </div>
                        <div style={{position:"absolute",bottom:-2,right:-2,width:"18px",height:"18px",borderRadius:"50%",background:C.white,display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${C.border}`}}>
                          {c.channel==="whatsapp" ? <WhatsAppIcon size={10}/> : <EmailIcon size={10}/>}
                        </div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:"8px"}}>
                          <span style={{fontSize:"13.5px",fontWeight:700,color:C.text}}>{c.name}</span>
                          <span style={{fontSize:"10.5px",color:C.mutedLight,flexShrink:0}}>{c.lastActivity}</span>
                        </div>
                        <div style={{fontSize:"11.5px",color:C.muted,marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>
                          {last.from==="ai" && <span style={{color:C.accent,fontWeight:600}}>Vero: </span>}
                          {last.from==="user" && <span style={{color:C.primary,fontWeight:600}}>Você: </span>}
                          {last.text.slice(0,80)}{last.text.length>80?"…":""}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"7px",flexWrap:"wrap"}}>
                          <span style={{background:statusLabel.bg,color:statusLabel.color,border:`1px solid ${statusLabel.color}33`,fontSize:"10px",padding:"2px 7px",borderRadius:"5px",fontWeight:600}}>{statusLabel.text}</span>
                          {c.unread>0 && <span style={{background:C.accent,color:C.white,fontSize:"10px",padding:"2px 7px",borderRadius:"5px",fontWeight:700}}>{c.unread} nova</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversation detail view */}
        {view==="inbox" && openConv && currentConv && (
          <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 58px - 72px)",background:C.surface}}>
            {/* Conv header */}
            <div style={{background:C.white,padding:"11px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:"11px",flexShrink:0}}>
              <button onClick={closeConversation} style={{background:"none",border:"none",color:C.muted,fontSize:"22px",cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:"36px",height:"36px",borderRadius:"9px",background:currentConv.channel==="whatsapp"?C.whatsappLight:C.emailLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,color:currentConv.channel==="whatsapp"?C.whatsapp:C.email}}>
                  {currentConv.ini}
                </div>
                <div style={{position:"absolute",bottom:-2,right:-2,width:"16px",height:"16px",borderRadius:"50%",background:C.white,display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${C.border}`}}>
                  {currentConv.channel==="whatsapp" ? <WhatsAppIcon size={8}/> : <EmailIcon size={8}/>}
                </div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"13.5px",fontWeight:700,color:C.text}}>{currentConv.name}</div>
                <div style={{fontSize:"10.5px",color:C.muted,textTransform:"capitalize"}}>{currentConv.channel} · {currentConv.lastActivity}</div>
              </div>
            </div>

            {/* Messages */}
            <div ref={convScrollRef} style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:"10px"}}>
              {currentConv.messages.map((m,i)=>{
                if(m.pending){
                  return(
                    <div key={i} className="fade-in" style={{background:C.warningLight,border:`1.5px solid ${C.warningBorder}`,borderRadius:"12px",padding:"14px",margin:"8px 0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"10px"}}>
                        <span style={{fontSize:"14px"}}>⚠️</span>
                        <span style={{fontSize:"11px",fontWeight:700,color:C.warning,letterSpacing:"0.05em"}}>APROVAÇÃO NECESSÁRIA</span>
                      </div>
                      <p style={{fontSize:"13px",color:C.text,lineHeight:1.5,marginBottom:"4px"}}>
                        A cliente pediu <b>{m.discountRequested}% de desconto</b>. Seu limite atual é <b>{m.currentLimit}%</b>.
                      </p>
                      <p style={{fontSize:"11.5px",color:C.muted,marginBottom:"12px"}}>Se aprovar, Vero aplica e envia. Se recusar, envia contra-oferta com o seu limite máximo.</p>
                      <div style={{display:"flex",gap:"8px"}}>
                        <button onClick={()=>rejectDiscount(currentConv.id)} className="btn" style={{flex:1,background:C.white,color:C.muted,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px",fontSize:"12.5px",fontWeight:600}}>
                          Enviar {m.currentLimit}% (limite)
                        </button>
                        <button onClick={()=>approveDiscount(currentConv.id)} className="btn" style={{flex:1,background:C.success,color:C.white,borderRadius:"8px",padding:"10px",fontSize:"12.5px",fontWeight:600}}>
                          Aprovar {m.discountRequested}%
                        </button>
                      </div>
                    </div>
                  );
                }
                if(m.flagged){
                  return(
                    <div key={i} className="fade-in" style={{background:C.dangerLight,border:`1.5px solid ${C.dangerBorder}`,borderRadius:"12px",padding:"14px",margin:"8px 0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"8px"}}>
                        <span style={{fontSize:"14px"}}>⚠️</span>
                        <span style={{fontSize:"11px",fontWeight:700,color:C.danger,letterSpacing:"0.05em"}}>VERO NÃO RESPONDEU</span>
                      </div>
                      <p style={{fontSize:"12.5px",color:C.text,lineHeight:1.55,marginBottom:"10px"}}>{m.text}</p>
                      <button onClick={()=>generateAiDraft(currentConv)} className="btn" style={{background:C.white,border:`1px solid ${C.dangerBorder}`,color:C.danger,borderRadius:"7px",padding:"7px 12px",fontSize:"11.5px",fontWeight:600}}>
                        ✦ Sugerir resposta
                      </button>
                    </div>
                  );
                }
                const isClient = m.from==="client", isAi = m.from==="ai", isUser = m.from==="user";
                return(
                  <div key={i} className="fade-in">
                    {isAi && m.trigger && (
                      <div style={{fontSize:"10px",color:C.accent,textAlign:"center",marginBottom:"5px",fontWeight:600,letterSpacing:"0.04em"}}>
                        ✦ {m.trigger}
                      </div>
                    )}
                    {m.subject && (
                      <div style={{fontSize:"11px",color:C.muted,textAlign:"center",marginBottom:"5px",fontStyle:"italic"}}>
                        Assunto: {m.subject}
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:isClient?"flex-start":"flex-end",gap:"8px"}}>
                      <div style={{maxWidth:"78%",background:isClient?C.white:isAi?C.accentLight:C.primary,color:isClient?C.text:isAi?C.primary:C.white,borderRadius:isClient?"14px 14px 14px 3px":"14px 14px 3px 14px",padding:"10px 13px",fontSize:"13px",lineHeight:1.55,border:isClient?`1px solid ${C.border}`:isAi?`1px solid ${C.accentBorder}`:"none",whiteSpace:"pre-line"}}>
                        {isAi && <div style={{fontSize:"9.5px",fontWeight:700,color:C.accent,letterSpacing:"0.05em",marginBottom:"3px"}}>VERO · AUTOMÁTICO</div>}
                        {isUser && <div style={{fontSize:"9.5px",fontWeight:700,color:"rgba(255,255,255,.5)",letterSpacing:"0.05em",marginBottom:"3px"}}>VOCÊ</div>}
                        {m.text}
                        <div style={{fontSize:"9.5px",opacity:.6,marginTop:"4px",textAlign:"right"}}>{m.time}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {learning && (
                <div className="fade-in" style={{display:"flex",alignItems:"center",gap:"8px",justifyContent:"center",padding:"6px"}}>
                  <div style={{background:C.accentLight,border:`1px solid ${C.accentBorder}`,color:C.accent,fontSize:"11px",padding:"6px 12px",borderRadius:"20px",fontWeight:600,display:"flex",alignItems:"center",gap:"6px"}}>
                    <Dots/>
                    <span>Vero está aprendendo com seu estilo…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Reply composer */}
            <div style={{background:C.white,padding:"10px 14px 14px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              {aiDraft && (
                <div style={{background:C.accentLight,border:`1px solid ${C.accentBorder}`,borderRadius:"10px",padding:"11px 12px",marginBottom:"9px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
                    <span style={{fontSize:"10px",fontWeight:700,color:C.accent,letterSpacing:"0.05em"}}>✦ SUGESTÃO DA VERO</span>
                    <button onClick={()=>setAiDraft("")} style={{background:"none",border:"none",color:C.muted,fontSize:"14px",cursor:"pointer",padding:0,lineHeight:1}}>✕</button>
                  </div>
                  <p style={{fontSize:"12.5px",color:C.text,lineHeight:1.55,marginBottom:"9px"}}>{aiDraft}</p>
                  <div style={{display:"flex",gap:"7px"}}>
                    <button onClick={useAiDraft} className="btn" style={{flex:1,background:C.accent,color:C.white,borderRadius:"7px",padding:"7px",fontSize:"11.5px",fontWeight:600}}>Usar</button>
                    <button onClick={()=>generateAiDraft(currentConv)} disabled={draftLd} className="btn" style={{background:C.white,border:`1px solid ${C.accentBorder}`,color:C.accent,borderRadius:"7px",padding:"7px 12px",fontSize:"11.5px",fontWeight:600}}>{draftLd?"…":"↺"}</button>
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:"8px",alignItems:"flex-end"}}>
                <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Responder manualmente (Vero vai aprender com seu estilo)…" rows={1}
                  style={{flex:1,padding:"10px 13px",border:`1.5px solid ${C.border}`,borderRadius:"10px",fontSize:"13px",outline:"none",background:C.surface,color:C.text,resize:"none",fontFamily:"'Plus Jakarta Sans',sans-serif",minHeight:"40px",maxHeight:"100px"}}
                  onFocus={e=>{e.target.style.borderColor=C.accent;}} onBlur={e=>{e.target.style.borderColor=C.border;}}/>
                {!aiDraft && !replyText && (
                  <button onClick={()=>generateAiDraft(currentConv)} disabled={draftLd} className="btn" style={{background:C.accentLight,color:C.accent,border:`1px solid ${C.accentBorder}`,borderRadius:"10px",padding:"10px 14px",fontSize:"13px",fontWeight:600,flexShrink:0}}>
                    {draftLd?"…":"✦"}
                  </button>
                )}
                {replyText && (
                  <button onClick={sendUserReply} className="btn" style={{background:C.accent,color:C.white,borderRadius:"10px",padding:"10px 16px",fontSize:"14px",fontWeight:600,flexShrink:0}}>→</button>
                )}
              </div>
              {autoLearn && (
                <p style={{fontSize:"10.5px",color:C.mutedLight,marginTop:"7px",display:"flex",alignItems:"center",gap:"5px"}}>
                  <span style={{color:C.accent}}>✨</span> Vero aprende com cada mensagem sua. {learnedCount} padrões capturados.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════ CLIENTES ══════════════════════════ */}
        {view==="clients"&&(
          <div style={{padding:"16px"}}>
            {/* Leads pipeline */}
            <div style={{marginBottom:"18px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                <h2 style={{fontSize:"17px",fontWeight:800,color:C.text}}>Leads</h2>
                <button onClick={()=>setShowLeads(!showLeads)} style={{background:"none",border:"none",color:C.accent,fontSize:"11.5px",fontWeight:600,cursor:"pointer"}}>
                  {showLeads?"Ocultar":"Mostrar"}
                </button>
              </div>

              {showLeads && (
                <>
                  {/* Pipeline stages */}
                  <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                    {LEAD_STAGES.map(s=>{
                      const count = MOCK_LEADS.filter(l=>l.stage===s.id).length;
                      return(
                        <div key={s.id} style={{flex:1,background:C.white,border:`1px solid ${C.border}`,borderRadius:"9px",padding:"10px 6px",textAlign:"center",borderTop:`3px solid ${s.color}`}}>
                          <div style={{fontSize:"18px",fontWeight:800,color:s.color,lineHeight:1}}>{count}</div>
                          <div style={{fontSize:"9.5px",color:C.muted,marginTop:"4px",fontWeight:500}}>{s.label}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Lead cards */}
                  <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
                    {MOCK_LEADS.map(l=>{
                      const stage = LEAD_STAGES.find(s=>s.id===l.stage);
                      return(
                        <div key={l.id} style={{background:C.white,borderRadius:"11px",padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:"11px"}}>
                          <div style={{position:"relative",flexShrink:0}}>
                            <div style={{width:"38px",height:"38px",borderRadius:"9px",background:l.source==="whatsapp"?C.whatsappLight:l.source==="email"?C.emailLight:C.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,color:l.source==="whatsapp"?C.whatsapp:l.source==="email"?C.email:C.accent}}>
                              {l.ini}
                            </div>
                            {l.hot && (
                              <div style={{position:"absolute",top:-4,right:-4,background:C.danger,color:C.white,fontSize:"10px",width:"16px",height:"16px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${C.white}`}}>🔥</div>
                            )}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                              <span style={{fontSize:"13px",fontWeight:600,color:C.text}}>{l.name}</span>
                            </div>
                            <div style={{fontSize:"11px",color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.interest}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <span style={{background:`${stage.color}22`,color:stage.color,fontSize:"10px",padding:"3px 8px",borderRadius:"5px",fontWeight:600}}>{stage.label}</span>
                            <div style={{fontSize:"10px",color:C.mutedLight,marginTop:"3px"}}>há {l.days}d</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Existing clients */}
            <h2 style={{fontSize:"17px",fontWeight:800,color:C.text,marginBottom:"14px"}}>Clientes</h2>
            <div style={{display:"flex",gap:"7px",marginBottom:"14px",overflowX:"auto",paddingBottom:"3px"}}>
              {[{id:"todos",l:"Todos"},{id:"ativo",l:"Ativos"},{id:"alerta",l:"Alerta"},{id:"risco",l:"Risco"},{id:"inativo",l:"Inativos"}].map(f=>(
                <button key={f.id} onClick={()=>setFilter(f.id)} className="btn" style={{flexShrink:0,background:filter===f.id?C.primary:C.white,color:filter===f.id?C.white:C.muted,border:`1px solid ${filter===f.id?C.primary:C.border}`,borderRadius:"20px",padding:"6px 14px",fontSize:"12px",fontWeight:500,transition:"all .15s"}}>{f.l}</button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
              {filtered.map(c=>{
                const sm=statusMeta(c.status);
                return(
                  <div key={c.id} style={{background:C.white,borderRadius:"12px",padding:"14px 16px",border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <div style={{width:"42px",height:"42px",borderRadius:"10px",background:C.accentLight,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:700,color:C.accent}}>{c.ini}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"14px",fontWeight:600,color:C.text}}>{c.name}</div>
                        <div style={{fontSize:"11.5px",color:C.muted}}>{c.area} · {c.sessions} sessões</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"13px",fontWeight:800,color:C.accent}}>R${c.mrr}/mês</div>
                        <span style={{display:"inline-block",background:sm.bg,color:sm.color,border:`1px solid ${sm.border}`,fontSize:"10px",padding:"2px 7px",borderRadius:"5px",fontWeight:600,marginTop:"2px"}}>{sm.label}</span>
                      </div>
                    </div>
                    <div style={{marginTop:"10px",paddingTop:"10px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:"11px",color:C.muted}}>{c.days===0?"Hoje":c.days===1?"Ontem":`Há ${c.days} dias`}</span>
                      {(c.status==="risco"||c.status==="alerta"||c.status==="inativo")&&(
                        <button onClick={()=>{setView("dashboard");setTimeout(()=>genReactivation(c),200);}} className="btn" style={{background:C.accentLight,color:C.accent,border:`1px solid ${C.accentBorder}`,borderRadius:"6px",padding:"5px 11px",fontSize:"11px",fontWeight:600}}>Reativar</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeC && (
              <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setActiveC(null)}>
                <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:"16px 16px 0 0",padding:"20px",width:"100%",maxWidth:"480px",maxHeight:"80vh",overflow:"auto"}} className="fade-up">
                  <div style={{width:"40px",height:"4px",background:C.border,borderRadius:"3px",margin:"0 auto 16px"}}/>
                  <h3 style={{fontSize:"15px",fontWeight:700,color:C.text,marginBottom:"4px"}}>Reativar {activeC.name}</h3>
                  <p style={{fontSize:"12px",color:C.muted,marginBottom:"14px"}}>Vero vai gerar uma mensagem personalizada com base no seu estilo.</p>
                  {msgLd ? <div style={{display:"flex",alignItems:"center",gap:"10px"}}><Dots/><span style={{color:C.muted,fontSize:"12px"}}>Gerando…</span></div> : (
                    <>
                      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"13px",fontSize:"13px",color:C.text,lineHeight:1.6,marginBottom:"12px"}}>{aiMsg}</div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <button onClick={copyMsg} className="btn" style={{flex:1,background:copied?C.success:C.accent,color:C.white,borderRadius:"8px",padding:"11px",fontSize:"13px",fontWeight:600}}>{copied?"✓ Copiado":"Copiar"}</button>
                        <button onClick={()=>setActiveC(null)} className="btn" style={{background:C.white,border:`1px solid ${C.border}`,color:C.muted,borderRadius:"8px",padding:"11px 18px",fontSize:"13px",fontWeight:500}}>Fechar</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ AGENDA ══════════════════════════ */}
        {view==="schedule"&&(
          <div style={{padding:"16px"}}>
            <h2 style={{fontSize:"17px",fontWeight:800,color:C.text,marginBottom:"3px"}}>Agenda</h2>
            <p style={{fontSize:"13px",color:C.muted,marginBottom:"18px",textTransform:"capitalize"}}>{todayStr}</p>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {MOCK_AGENDA.map(a=>(
                <div key={a.id} style={{background:C.white,borderRadius:"12px",padding:"16px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${a.confirmed?C.success:C.warning}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                    <span style={{fontSize:"22px",fontWeight:800,color:C.primary,letterSpacing:"-0.02em"}}>{a.time}</span>
                    <span style={{background:a.confirmed?C.successLight:C.warningLight,color:a.confirmed?C.success:C.warning,border:`1px solid ${a.confirmed?C.successBorder:C.warningBorder}`,fontSize:"11px",padding:"4px 10px",borderRadius:"7px",fontWeight:600}}>{a.confirmed?"✓ Confirmado":"⏳ Aguardando"}</span>
                  </div>
                  <div style={{fontSize:"14px",fontWeight:700,color:C.text,marginBottom:"2px"}}>{a.client}</div>
                  <div style={{fontSize:"12px",color:C.muted}}>{a.service} · {a.min} min</div>
                  {!a.confirmed&&(
                    <button onClick={()=>showToast("Lembrete enviado para "+a.client.split(" ")[0])} className="btn" style={{marginTop:"12px",width:"100%",background:C.accentLight,color:C.accent,border:`1px solid ${C.accentBorder}`,borderRadius:"8px",padding:"9px",fontSize:"12.5px",fontWeight:600}}>
                      Enviar lembrete de confirmação
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={()=>showToast("Em breve: criar agendamentos 🗓️")} className="btn" style={{width:"100%",marginTop:"14px",background:C.primary,color:C.white,borderRadius:"10px",padding:"13px",fontSize:"14px",fontWeight:600}}>
              + Novo agendamento
            </button>
          </div>
        )}

        {/* ══════════════════════════ CONFIG ══════════════════════════ */}
        {view==="settings"&&(
          <div style={{padding:"16px"}}>
            <h2 style={{fontSize:"17px",fontWeight:800,color:C.text,marginBottom:"18px"}}>Configurações</h2>

            {/* What Mira learned */}
            <Card title="APRENDIZADO DA MIRA" action={<span style={{background:C.accentLight,color:C.accent,fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"10px"}}>{learnedCount} padrões</span>}>
              <p style={{fontSize:"12px",color:C.muted,marginBottom:"12px",lineHeight:1.6}}>
                A Vero analisa suas mensagens e aprende seu estilo de comunicação. Quanto mais você interage, melhor ela representa você.
              </p>
              {LEARNED_PATTERNS.map(p=>(
                <div key={p.label} style={{padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                    <span style={{fontSize:"12px",fontWeight:600,color:C.text}}>{p.label}</span>
                    <span style={{fontSize:"10.5px",color:C.accent,fontWeight:700}}>{p.confidence}%</span>
                  </div>
                  <div style={{fontSize:"11.5px",color:C.muted,marginBottom:"5px"}}>{p.value}</div>
                  <div style={{height:"3px",background:C.border,borderRadius:"2px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${p.confidence}%`,background:C.accent,borderRadius:"2px"}}/>
                  </div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 4px"}}>
                <div style={{flex:1,paddingRight:"10px"}}>
                  <div style={{fontSize:"12.5px",fontWeight:600,color:C.text}}>Aprender automaticamente</div>
                  <div style={{fontSize:"11px",color:C.muted,marginTop:"2px"}}>Vero aprende cada vez que você responde manualmente</div>
                </div>
                <Toggle on={autoLearn} onClick={()=>{setAutoLearn(!autoLearn);showToast(autoLearn?"Aprendizado pausado":"Aprendizado ativado");}}/>
              </div>
            </Card>

            {/* DNA */}
            <Card title="DNA DO NEGÓCIO">
              {dna&&[["Nome",dna.nome],["Área",dna.area],["Horários",dna.horarios],["Cancelamento",dna.cancelamento]].filter(([,v])=>v).map(([k,v])=>(
                <InfoRow key={k} label={k} value={v}/>
              ))}
            </Card>

            {/* WhatsApp */}
            <Card title="WHATSAPP">
              <p style={{fontSize:"12.5px",color:C.muted,marginBottom:"12px",lineHeight:1.6}}>
                Conecte seu WhatsApp para a Vero enviar e receber mensagens automaticamente.
              </p>
              <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                {["business","pessoal"].map(t=>(
                  <button key={t} onClick={()=>setWp(p=>({...p,tipo:t}))} className="btn" style={{flex:1,background:wp.tipo===t?C.primary:C.white,color:wp.tipo===t?C.white:C.muted,border:`1px solid ${wp.tipo===t?C.primary:C.border}`,borderRadius:"8px",padding:"9px",fontSize:"12px",fontWeight:600,textTransform:"capitalize",transition:"all .15s"}}>
                    {t==="business"?"Business":"Pessoal"}
                  </button>
                ))}
              </div>
              <FInput label="Número do WhatsApp" value={wp.numero} onChange={v=>setWp(p=>({...p,numero:v}))} placeholder="+55 11 99999-9999" hint="Inclua o código do país (+55) e DDD"/>
              <div style={{background:wp.conectado?C.successLight:C.surface,border:`1px solid ${wp.conectado?C.successBorder:C.border}`,borderRadius:"10px",padding:"12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div className={wp.conectado?"pulse-dot":""} style={{width:"8px",height:"8px",borderRadius:"50%",background:wp.conectado?C.success:C.mutedLight}}/>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:600,color:wp.conectado?C.success:C.muted}}>{wp.conectado?"Conectado":"Não conectado"}</div>
                    {wp.conectado && <div style={{fontSize:"10.5px",color:C.muted,marginTop:"1px"}}>via {wp.provedor}</div>}
                  </div>
                </div>
                <button onClick={()=>{if(!wp.numero){showToast("Insira o número primeiro");return;}setWp(p=>({...p,conectado:!p.conectado}));showToast(wp.conectado?"WhatsApp desconectado":"WhatsApp conectado! ✓");}} className="btn"
                  style={{background:wp.conectado?C.dangerLight:C.accent,color:wp.conectado?C.danger:C.white,border:`1px solid ${wp.conectado?C.dangerBorder:"transparent"}`,borderRadius:"7px",padding:"7px 14px",fontSize:"12px",fontWeight:600}}>
                  {wp.conectado?"Desconectar":"Conectar"}
                </button>
              </div>
            </Card>

            {/* Email */}
            <Card title="E-MAIL">
              <p style={{fontSize:"12.5px",color:C.muted,marginBottom:"12px",lineHeight:1.6}}>
                Conecte seu e-mail para confirmações, lembretes e follow-ups automáticos.
              </p>
              <FInput label="Endereço de e-mail" value={em.email} onChange={v=>setEm(p=>({...p,email:v}))} placeholder="seuemail@gmail.com" type="email"/>
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                {["Gmail","Outlook","Outro"].map(p=>(
                  <button key={p} onClick={()=>{if(!em.email){showToast("Insira o email primeiro");return;}setEm(prev=>({...prev,conectado:true,provedor:p}));showToast(`${p} conectado! ✓`);}} className="btn"
                    style={{flex:1,background:em.conectado&&em.provedor===p?C.accentLight:C.white,color:em.conectado&&em.provedor===p?C.accent:C.muted,border:`1px solid ${em.conectado&&em.provedor===p?C.accentBorder:C.border}`,borderRadius:"8px",padding:"9px",fontSize:"12px",fontWeight:600,transition:"all .15s"}}>
                    {p}
                  </button>
                ))}
              </div>
              {em.conectado&&(
                <div style={{background:C.successLight,border:`1px solid ${C.successBorder}`,borderRadius:"9px",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <div className="pulse-dot" style={{width:"7px",height:"7px",borderRadius:"50%",background:C.success}}/>
                    <span style={{fontSize:"12.5px",color:C.success,fontWeight:500}}>{em.email}</span>
                  </div>
                  <button onClick={()=>{setEm({email:"",conectado:false,provedor:""});showToast("Email desconectado");}} style={{background:"none",border:"none",color:C.danger,fontSize:"11px",cursor:"pointer",fontWeight:600}}>Remover</button>
                </div>
              )}
            </Card>

            {/* Discount Permission */}
            <Card title="PERMISSÃO DE DESCONTOS">
              <p style={{fontSize:"12px",color:C.muted,marginBottom:"14px",lineHeight:1.6}}>
                Defina até quanto a Vero pode oferecer de desconto sozinha. Pedidos acima desse limite vão aparecer para sua aprovação.
              </p>
              <FSlider label="Desconto máximo automático" value={maxDiscount} onChange={setMaxDiscount} min={0} max={30} suffix="%" hint="Acima desse valor, a Vero pede sua aprovação antes de oferecer"/>
              <div style={{background:C.accentLight,border:`1px solid ${C.accentBorder}`,borderRadius:"9px",padding:"11px 13px",marginTop:"4px"}}>
                <div style={{fontSize:"11.5px",color:C.primary,lineHeight:1.55}}>
                  Até <b>{maxDiscount}%</b>: Vero oferece direto.<br/>
                  Acima de <b>{maxDiscount}%</b>: Vero envia para você aprovar.
                </div>
              </div>
            </Card>

            {/* Tom */}
            <Card title="TOM DE COMUNICAÇÃO">
              {[
                {val:"informal",      label:"Informal e caloroso",    sub:"Oi, olá — linguagem próxima e acolhedora"},
                {val:"formal",        label:"Formal e profissional",  sub:"Prezado(a) — linguagem técnica e respeitosa"},
                {val:"descontraído",  label:"Descontraído",           sub:"Leve, amigável, sem formalidade"},
                {val:"técnico",       label:"Técnico e direto",       sub:"Objetivo, sem rodeios"},
              ].map(o=>(
                <RadioRow key={o.val} label={o.label} sublabel={o.sub} active={tom===o.val} onClick={()=>{setTom(o.val);showToast("Tom atualizado");}}/>
              ))}
            </Card>

            {/* Emoji */}
            <Card title="USO DE EMOJI">
              {[
                {val:"sim",      label:"Sim, bastante",    sub:"Mensagens mais expressivas e descontraídas 😊"},
                {val:"às vezes", label:"Às vezes",         sub:"Só quando faz sentido contextualmente"},
                {val:"não",      label:"Prefiro não usar", sub:"Comunicação limpa, só texto"},
              ].map(o=>(
                <RadioRow key={o.val} label={o.label} sublabel={o.sub} active={emoji===o.val} onClick={()=>{setEmoji(o.val);showToast("Preferência de emoji salva");}}/>
              ))}
            </Card>

            {/* Tratamento */}
            <Card title="COMO TRATAR CLIENTES">
              {[
                {val:"primeiro nome",  label:"Pelo primeiro nome",    sub:"Oi Ana, Oi Carlos…"},
                {val:"você formal",    label:'Com "você" formal',     sub:"Você confirmou sua consulta…"},
                {val:"senhor/senhora", label:"Senhor / Senhora",      sub:"O senhor tem consulta amanhã…"},
              ].map(o=>(
                <RadioRow key={o.val} label={o.label} sublabel={o.sub} active={tratamento===o.val} onClick={()=>{setTratamento(o.val);showToast("Preferência salva");}}/>
              ))}
            </Card>

            {/* Limites da IA */}
            <Card title="LIMITES DA IA">
              <p style={{fontSize:"12px",color:C.muted,marginBottom:"12px",lineHeight:1.6}}>
                Defina o que a IA faz sozinha e o que deve esperar sua aprovação.
              </p>
              {[
                {k:"confirmar",   label:"Confirmar agendamentos",  desc:"IA agenda e confirma automaticamente"},
                {k:"precos",      label:"Informar preços",          desc:"IA responde sobre valores dos serviços"},
                {k:"lembretes",   label:"Enviar lembretes",         desc:"IA manda avisos antes das consultas"},
                {k:"avaliacoes",  label:"Pedir avaliações",         desc:"IA solicita feedback após atendimento"},
                {k:"descontos",   label:"Oferecer descontos",       desc:`Até ${maxDiscount}% (configurado acima)`},
                {k:"cancelar",    label:"Cancelar agendamentos",    desc:"IA cancela a pedido do cliente"},
                {k:"reclamacoes", label:"Responder reclamações",    desc:"IA lida com insatisfações"},
              ].map(item=>(
                <div key={item.k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{flex:1,paddingRight:"14px"}}>
                    <div style={{fontSize:"13px",fontWeight:600,color:C.text}}>{item.label}</div>
                    <div style={{fontSize:"11px",color:C.muted,marginTop:"1px"}}>{item.desc}</div>
                  </div>
                  <Toggle on={limits[item.k]} onClick={()=>toggleLimit(item.k)}/>
                </div>
              ))}
            </Card>

            {/* Personalização de mensagens */}
            <Card title="PERSONALIZAÇÃO DE MENSAGENS">
              <p style={{fontSize:"12px",color:C.muted,marginBottom:"14px",lineHeight:1.6}}>
                Defina as mensagens padrão. Deixe em branco para usar os padrões inteligentes da Vero.
              </p>
              <FInput label="Saudação padrão" value={per.saudacao} onChange={v=>setPer("saudacao",v)} placeholder="Oi, Olá, Bom dia…"/>
              <FInput label="Despedida padrão" value={per.despedida} onChange={v=>setPer("despedida",v)} placeholder="Até logo!, Um abraço!…"/>
              <FInput label="Assinatura (opcional)" value={per.assinatura} onChange={v=>setPer("assinatura",v)} placeholder="Dra. Ana — Psicóloga CRP 12345"/>
              <FTextarea label="Boas-vindas (novo cliente)" value={per.msgBemVindo} onChange={v=>setPer("msgBemVindo",v)} placeholder="Olá! Seja bem-vindo(a). Fico feliz em ter você aqui…" rows={3}/>
              <FTextarea label="Mensagem pós-atendimento" value={per.msgPosAtend} onChange={v=>setPer("msgPosAtend",v)} placeholder="Obrigada pela sua visita hoje! Como se sentiu…" rows={3}/>
              <FTextarea label="Reativação padrão" value={per.msgReativacao} onChange={v=>setPer("msgReativacao",v)} placeholder="Oi {nome}! Faz um tempo. Quando quiser marcar…" rows={3}/>
              <button onClick={()=>showToast("Mensagens salvas ✓")} className="btn" style={{width:"100%",background:C.accent,color:C.white,borderRadius:"8px",padding:"11px",fontSize:"13px",fontWeight:600,marginTop:"4px"}}>
                Salvar mensagens
              </button>
            </Card>

            {/* Automações */}
            <Card title="AUTOMAÇÕES">
              <p style={{fontSize:"12px",color:C.muted,marginBottom:"12px",lineHeight:1.6}}>
                Configure os gatilhos automáticos da Vero.
              </p>
              <FInput label="Dias para alerta (sem contato)" value={per.followDias} onChange={v=>setPer("followDias",v)} placeholder="30" hint="Padrão: 30 dias — entra em amarelo no painel"/>
              <FInput label="Dias para inativo (reativação automática)" value={per.reativDias} onChange={v=>setPer("reativDias",v)} placeholder="45" hint="Padrão: 45 dias — IA envia mensagem de reativação"/>
              <FInput label="Link de avaliação Google" value={per.googleLink} onChange={v=>setPer("googleLink",v)} placeholder="https://g.page/r/seu-negocio/review" hint="Cole aqui o link gerado no Google Meu Negócio"/>
              <button onClick={()=>showToast("Automações salvas ✓")} className="btn" style={{width:"100%",background:C.accent,color:C.white,borderRadius:"8px",padding:"11px",fontSize:"13px",fontWeight:600,marginTop:"4px"}}>
                Salvar automações
              </button>
            </Card>

            <button onClick={()=>{if(window.confirm("Isso apaga toda a configuração. Confirmar?")){window.storage.delete("vero:apikey").catch(()=>{});window.storage.delete("vero:dna").catch(()=>{});onReset();}}}
              style={{width:"100%",background:"none",border:`1px solid ${C.dangerBorder}`,color:C.danger,borderRadius:"10px",padding:"12px",fontSize:"13px",cursor:"pointer",fontWeight:500,marginBottom:"8px"}}>
              Reiniciar configuração
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      {!openConv && (
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 16px",zIndex:100}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",background:"none",border:"none",cursor:"pointer",padding:"5px 0",position:"relative"}}>
              <div style={{position:"relative"}}>
                <span style={{color:view===n.id?C.accent:C.mutedLight,transition:"color .15s",display:"block"}}>{n.icon}</span>
                {n.badge>0 && (
                  <span style={{position:"absolute",top:-5,right:-8,background:C.danger,color:C.white,fontSize:"9px",fontWeight:700,minWidth:"15px",height:"15px",padding:"0 4px",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${C.white}`}}>
                    {n.badge}
                  </span>
                )}
              </div>
              <span style={{fontSize:"10px",fontWeight:view===n.id?700:400,color:view===n.id?C.accent:C.mutedLight,transition:"all .15s"}}>{n.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════
export default function App(){
  const [screen,setScreen]=useState("loading");
  const [sbUrl,setSbUrl]=useState("");
  const [sbKey,setSbKey]=useState("");
  const [sb,setSb]=useState(null);
  const [authToken,setAuthToken]=useState("");
  const [userEmail,setUserEmail]=useState("");
  const [apiKey,setApiKey]=useState("");
  const [dna,setDna]=useState(null);

  useEffect(()=>{
    (async()=>{
      try{
        const u=await window.storage.get("vero:sb_url");
        const k=await window.storage.get("vero:sb_key");
        const t=await window.storage.get("vero:auth_token");
        const e=await window.storage.get("vero:user_email");
        const ck=await window.storage.get("vero:apikey");
        const d=await window.storage.get("vero:dna");

        if(u?.value&&k?.value){
          setSbUrl(u.value);setSbKey(k.value);
          setSb(createSupabase(u.value,k.value));
        }
        if(t?.value){setAuthToken(t.value);}
        if(e?.value){setUserEmail(e.value);}
        if(ck?.value){setApiKey(ck.value);}
        if(d?.value){setDna(JSON.parse(d.value));}

        if(!u?.value) setScreen("sb_setup");
        else if(!t?.value) setScreen("auth");
        else if(!ck?.value) setScreen("setup");
        else if(!d?.value) setScreen("onboarding");
        else setScreen("app");
      }catch{setScreen("landing");}
    })();
  },[]);

  const reset=()=>{
    ["vero:sb_url","vero:sb_key","vero:auth_token","vero:user_email","vero:apikey","vero:dna"]
      .forEach(k=>window.storage.delete(k).catch(()=>{}));
    setSbUrl("");setSbKey("");setSb(null);setAuthToken("");setApiKey("");setDna(null);
    setScreen("landing");
  };

  if(screen==="loading") return(
    <div style={{minHeight:"100vh",background:C.primary,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <MiraLogo size={28} dark={false}/>
    </div>
  );

  return(
    <>
      <style dangerouslySetInnerHTML={{__html:STYLES}}/>
      {screen==="landing"   &&<Landing onStart={()=>setScreen("sb_setup")}/>}
      {screen==="sb_setup"  &&<SupabaseSetup onSave={(u,k)=>{setSbUrl(u);setSbKey(k);setSb(createSupabase(u,k));setScreen("auth");}}/>}
      {screen==="auth"      &&sb&&<AuthScreen sb={sb} onAuth={(token,email)=>{setAuthToken(token);setUserEmail(email);setScreen("setup");}}/>}
      {screen==="setup"     &&<ApiSetup onSave={async k=>{await window.storage.set("vero:apikey",k);setApiKey(k);setScreen("onboarding");}}/>}
      {screen==="onboarding"&&<Onboarding apiKey={apiKey} onComplete={async d=>{
        await window.storage.set("vero:dna",JSON.stringify(d));
        // Save profile to Supabase
        if(sb&&authToken){
          try{
            const user=await sb.getUser(authToken);
            if(user?.id){
              await sb.upsert("profiles",authToken,{
                id:user.id, email:userEmail,
                nome:d.nome, area:d.area,
                horarios:d.horarios||"", cancelamento:d.cancelamento||"",
                tom:d.tom, emoji:d.emoji, tratamento:d.tratamento,
              });
            }
          }catch(e){console.warn("Profile save error",e);}
        }
        setDna(d);setScreen("app");
      }}/>}
      {screen==="app"&&<MainApp apiKey={apiKey} dna={dna} sb={sb} authToken={authToken} userEmail={userEmail} onReset={reset}/>}
    </>
  );
}
