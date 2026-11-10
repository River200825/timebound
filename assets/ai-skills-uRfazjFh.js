import{s as R,j as v,ac as K,ad as k,ae as q,a0 as w,af as B,ag as E,a1 as x}from"./index-DG5hCpFs.js";const $=[{id:"decompose",name:"智能拆解",description:"一句话识别任务意图，追问后拆成可执行任务",output:"task",enabledByDefault:!0},{id:"meeting",name:"会议纪要提取",description:"粘贴会议记录/纪要，拆出行动项（负责人/截止日）",output:"task",enabledByDefault:!0},{id:"plan-week",name:"本周计划",description:"基于任务表 S 级/逾期/本周到期项，生成本周任务草稿",output:"task",context:"task-summary",enabledByDefault:!0},{id:"okr-breakdown",name:"OKR 拆任务",description:"把季度 OKR 拆成当季可执行任务，草稿自动关联 OKR",output:"task",context:"okr",enabledByDefault:!0},{id:"risk-check",name:"逾期风险检查",description:"只读分析任务表，输出本周风险与建议（不改任务）",output:"reply",context:"task-summary",enabledByDefault:!0}];function A(n){var t;return((t=$.find(r=>r.id===n))==null?void 0:t.name)??"自定义技能"}function I(n,t){return t==="decompose"?!0:n.builtin[t]!==!1}function L(n){return $.filter(t=>I(n,t.id))}function z(n,t){var r;return((r=n.custom.find(e=>e.id===t))==null?void 0:r.name)??A(t)}const N="decompose",j=[{id:"meeting",pattern:/纪要|会议记录|会议笔记|会议总结|行动项|action items?/i},{id:"plan-week",pattern:/周计划|本周计划|这周计划|本周(安排|排一下|排下|做什么|干什么)|这周(安排|排|做什么|干什么)|排.{0,4}(本周|这周)|本周计划/},{id:"okr-breakdown",pattern:/okr|关键结果|\bkr\b|目标.{0,8}拆|季度目标/i},{id:"risk-check",pattern:/风险|逾期|来不及|赶得上|有没有问题|危险/}];function P(n,t){for(const r of j)if(t(r.id)&&r.pattern.test(n))return r.id;return null}function T(n){const t=L(n).map(e=>({id:e.id,name:e.name,description:e.description})),r=n.custom.map(e=>({id:e.id,name:e.name,description:e.prompt.slice(0,80)}));return[...t,...r]}function Y(n){return`你是意图路由器。根据用户最新一句话，从下列技能中选最匹配的一个。
只输出严格 JSON：{"skill":"技能id"}，不要解释、不要 Markdown。

可选技能：
${n.map(r=>`- ${r.id}｜${r.name}｜${r.description}`).join(`
`)}

若没有明显匹配，输出 {"skill":"decompose"}。`}async function G(n,t,r){const e=a=>I(r,a)||r.custom.some(c=>c.id===a),i=P(t,e);if(i)return i;const s=T(r);try{const c=(await k(n,[{role:"system",content:Y(s)},{role:"user",content:t}])).match(/\{[\s\S]*?\}/);if(c){const d=JSON.parse(c[0]),o=typeof d.skill=="string"?d.skill.trim():"";if(o&&e(o))return o}}catch{}return N}function S(){const n=new Date,t=["周日","周一","周二","周三","周四","周五","周六"][n.getDay()];return`${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日（${t}）`}function M(){const n=new Date,t=(n.getDay()+6)%7,r=new Date(n);r.setDate(n.getDate()-t);const e=new Date(r);e.setDate(r.getDate()+6);const i=s=>`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`;return{start:i(r),end:i(e)}}function b(n){const t=["S","A","B+","B","B-","C"];return t.length-t.indexOf(n)}function V(n,t){const r=n.filter(s=>R(s.statusId,t).category==="active"),e=[...r].sort((s,a)=>b(a.priority)-b(s.priority)),i=[];if(!r.length)return"（任务表里暂无进行中任务）";for(const s of e.slice(0,15)){const a=v(s,t)?" · 逾期":"",c=s.dueStart?`${s.dueStart}${s.dueEnd&&s.dueEnd!==s.dueStart?`→${s.dueEnd}`:""}`:"无截止";i.push(`· ${s.title}｜截止 ${c}｜${s.priority} 级｜重要${s.importance}｜紧急${s.urgency}${a}`)}return r.length>15&&i.push(`…其余 ${r.length-15} 条略`),i.join(`
`).slice(0,1500)}function X(n,t){const r=K(),e=n.filter(a=>a.status==="active"&&a.quarter===r);if(!e.length)return null;const i=[],s=[];return e.forEach((a,c)=>{s.push(`O${c}：${a.title}${a.description?`（${a.description}）`:""}`),t.filter(o=>o.objectiveId===a.id).forEach(o=>{const l=i.length;i.push(o),s.push(`  KR${l}：${o.title}｜指标 ${o.metric}｜${o.baseline} → ${o.target}${o.unit}｜当前 ${o.current}${o.unit}｜截止 ${o.dueDate??"季度末"}`)})}),{objectives:e,keyResults:i,summary:s.join(`
`).slice(0,1600)}}const f=`输出格式（二选一，不要同时输出，不要输出 Markdown 代码块）：
A. 追问：{"question":"你想先确认什么？"}
B. 任务：{"tasks":[...]}

tasks 条目 JSON 格式：
{"title":"任务名称","description":"说明","dueStart":"YYYY-MM-DD 或 null","dueEnd":"YYYY-MM-DD 或 null","status":"未启动","importance":"高|中|低","urgency":"高|中|低","workload":"大|中|小","phase":"阶段或 null","process":"流程或 null","owner":"主责人或 null","participants":[],"confidence":0.0,"evidence":"原文依据"}

硬性规则：
- 输出必须是单行 JSON。
- 相对日期必须换算成绝对日期；只有单日期时 dueStart 与 dueEnd 相同。
- 不要输出 priority 字段。
- 一条任务只表达一件事。
- 每轮最多 10 条。`,m=`你是一个专业的任务规划助手。今天是 ${S()}，时区为本地时区。
优先从用户的话里识别任务意图；信息不足时只追问一个最关键的问题，每轮最多一问。
追问优先级：时间范围/截止日期 → 是否拆子任务 → 对谁 → 交付物或里程碑。
`;function D(){return`${m}
用户会粘贴会议记录、纪要或聊天记录。把其中的「行动项」拆成可执行任务：明确负责人、截止日期、交付物。
没写明负责人/截止日期就按纪要里最合理的信息补全或标记 null；信息不足时先追问一个问题。
${f}`}function C(n){const t=M();return`${m}
用户希望安排本周计划。今天是 ${S()}，本周是 ${t.start} ~ ${t.end}。

下面是用户任务表中未完成项的摘要（优先级已排序）：
${n}

请基于这些任务，产出 3~7 条本周可执行的任务草稿，聚焦：S 级与逾期项、本周到期项。
所有日期必须落在本周范围内。不要制造与摘要重复的相同任务；可以拆分大任务。
${f}`}function J(n){return`${m}
用户希望把活跃的 OKR 拆成可执行任务。下面是用户的活跃 OKR 列表（含下标，来自当前季度）：

${n.summary}

task 条目额外带一个字段 krIndex：表示对应 KR 的全局下标（0 起），例如 KR3 即 krIndex=3。
如果某条任务同时对应多个 KR，取最相关的一个。
如果用户没指明拆哪个目标，且有多个活跃目标，先追问一个问题确认目标；只有一个活跃目标时直接拆。
${f.replace('"evidence":"原文依据"}','"evidence":"对应哪个 KR","krIndex":0}')}`}function _(n){return`你是一个任务风险分析师。今天是 ${S()}。
用户希望了解任务表的逾期/风险情况。请基于下面未完成任务摘要：

${n}

输出要求：纯文本建议，不要输出 JSON、不要创建任何任务。
先给一句总判断，再列出：1) 逾期且 S/A 级的任务；2) 本周到期且重要度高的任务；3) 工作量过大或集中风险的提示；4) 2~3 条可执行建议。
语言简洁，不超过 300 字。`}function U(n){return`${m}
用户自定义技能「${n.name}」，按以下指令工作：
${n.prompt}

${f}`}function F(n,t){const r=n.slice(-8).map(e=>({role:e.role,content:e.content}));return r.push({role:"user",content:t}),r}function O(n){const t=n.match(/```(?:json)?\s*([\s\S]*?)```/i),r=(t==null?void 0:t[1])??n,e=r.indexOf("{"),i=r.lastIndexOf("}");if(e>=0&&i>e)try{const s=JSON.parse(r.slice(e,i+1));return typeof s.question=="string"&&s.question.trim()?{kind:"question",content:s.question.trim()}:{kind:"tasks",raw:s}}catch{}return{kind:"question",content:n.trim()||"AI 没有返回内容，请重试"}}function H(n,t){return((n==null?void 0:n.tasks)??[]).map(e=>{const i=e.importance??"中",s=e.urgency??"中",a=e.workload??"中",c=typeof e.krIndex=="number"?e.krIndex:void 0,d=c!==void 0?t.keyResults[c]:void 0,o=[];d&&o.push({objectiveId:d.objectiveId,keyResultId:d.id});const l=e.dueStart??e.dueEnd??null;return{id:x(),title:String(e.title??"").trim()||"未命名任务",description:String(e.description??""),dueStart:l,dueEnd:e.dueEnd??l,statusName:String(e.status??"未启动"),importance:i,urgency:s,workload:a,phase:e.phase??null,process:e.process??null,owner:e.owner??null,participants:Array.isArray(e.participants)?e.participants:[],confidence:typeof e.confidence=="number"?e.confidence:.7,evidence:String(e.evidence??""),priority:E(i,s),selected:!0,source:"ai-chat",projectId:null,okrLinks:o}})}async function Z(n){const{skillId:t,text:r,config:e,history:i,skills:s}=n;if(t==="decompose"){const u=await q(e,[...i,{role:"user",content:r}]);return u.kind==="question"?{kind:"question",content:u.content,skillId:t}:{kind:"tasks",tasks:u.tasks,skillId:t}}const a=$.find(u=>u.id===t),c=a?void 0:s.custom.find(u=>u.id===t);if(!a&&!c)throw new w("技能不存在或已停用","unsupported");if((a==null?void 0:a.output)==="reply"){const u=n.tasksSummary??"（暂无任务数据）",p=_(u),g=(await k(e,[{role:"system",content:p},...i.slice(-4).map(h=>({role:h.role,content:h.content})),{role:"user",content:r}])).trim();if(!g)throw new w("AI 没有返回内容，请重试","format");return{kind:"reply",content:g,skillId:t}}const d=F(i,r);let o;if(t==="meeting")o=D();else if(t==="plan-week")o=C(n.tasksSummary??"（暂无任务数据）");else if(t==="okr-breakdown"){const u=n.activeOkr;if(!u)return{kind:"question",content:"当前季度还没有活跃的 OKR，请先在 OKR 页创建目标，然后再让我拆任务。",skillId:t};o=J(u);const p=O(await k(e,[{role:"system",content:o},...d]));return p.kind==="question"?{kind:"question",content:p.content,skillId:t}:{kind:"tasks",tasks:H(p.raw,u),skillId:t}}else c?o=U(c):o=D();const l=await k(e,[{role:"system",content:o},...d]),y=O(l);if(y.kind==="question")return{kind:"question",content:y.content,skillId:t};try{return{kind:"tasks",tasks:B(y.raw,"ai-chat",[],void 0),skillId:t}}catch{return{kind:"question",content:l.trim().slice(0,800)||"AI 返回格式异常，请换句话或到设置更换模型",skillId:t}}}export{$ as B,X as a,V as b,Z as c,A as d,G as r,z as s};
