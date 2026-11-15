import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, ChevronRight, Clock3, GraduationCap, LayoutDashboard, LogOut, LockKeyhole, MessageCircle, Paperclip, Send, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { supabase, hasSupabaseConfig } from './lib/supabase'
import { chapters, timetable } from './data'
import type { Session } from '@supabase/supabase-js'

type Message = { id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string }
const formatTime = (date: string) => new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [section, setSection] = useState<'dashboard' | 'physics' | 'chemistry' | 'maths' | 'resources'>('dashboard')
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [chatError, setChatError] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase || activeChapter !== 'Alternating Current') { setMessages([]); return }
    let alive = true
    const load = async () => {
      const { data, error } = await supabase!.from('private_messages').select('*').order('created_at', { ascending: true }).limit(300)
      if (!alive) return
      if (error) setChatError(error.message)
      else {
        const rows = (data || []) as Message[]
        setMessages(rows)
        const paths = rows.filter(m => m.image_path).map(m => m.image_path!)
        const signed: Record<string, string> = {}
        for (const path of paths) {
          const { data: signedData } = await supabase!.storage.from('private-chat-photos').createSignedUrl(path, 3600)
          if (signedData?.signedUrl) signed[path] = signedData.signedUrl
        }
        if (alive) setImageUrls(signed)
      }
    }
    void load()
    const channel = supabase.channel('studyspace-private-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages' }, () => { void load() })
      .subscribe()
    return () => { alive = false; void supabase!.removeChannel(channel) }
  }, [session, activeChapter])

  const userId = session?.user.id
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  }, [])

  async function signIn(e: FormEvent) {
    e.preventDefault(); setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword })
    if (error) setAuthError(error.message)
    else { setLoginPassword(''); setActiveChapter('Alternating Current') }
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setActiveChapter(null); setMessages([]) }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !userId || !draft.trim()) return
    setSending(true); setChatError('')
    const { data: members, error: memberError } = await supabase.from('private_chat_members').select('user_id')
    if (memberError || !members || members.length !== 2) {
      setChatError(memberError?.message || 'The private room is not configured for exactly two members.'); setSending(false); return
    }
    const recipient = members.find(m => m.user_id !== userId)?.user_id
    if (!recipient) { setChatError('The second authorized account has not been configured.'); setSending(false); return }
    const { error } = await supabase.from('private_messages').insert({ sender_id: userId, recipient_id: recipient, body: draft.trim() })
    if (error) setChatError(error.message); else setDraft('')
    setSending(false)
  }

  async function sendPhoto(file?: File) {
    if (!supabase || !userId || !file) return
    if (!file.type.startsWith('image/')) { setChatError('Please choose an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setChatError('Please choose an image smaller than 8 MB.'); return }
    setUploading(true); setChatError('')
    const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('private-chat-photos').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) setChatError(uploadError.message)
    else {
      const { data: members } = await supabase.from('private_chat_members').select('user_id')
      const recipient = members?.find(m => m.user_id !== userId)?.user_id
      if (!recipient) setChatError('The second authorized account has not been configured.')
      else {
        const { error } = await supabase.from('private_messages').insert({ sender_id: userId, recipient_id: recipient, image_path: path })
        if (error) setChatError(error.message)
      }
    }
    setUploading(false)
  }

  async function deleteMessage(message: Message) {
    if (!supabase || message.sender_id !== userId) return
    const { error } = await supabase.from('private_messages').delete().eq('id', message.id)
    if (error) setChatError(error.message)
    else if (message.image_path) await supabase.storage.from('private-chat-photos').remove([message.image_path])
  }

  const active = chapters.find(c => c.title === activeChapter)
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'physics', label: 'Physics', icon: Sparkles },
    { id: 'chemistry', label: 'Chemistry', icon: BookOpen },
    { id: 'maths', label: 'Mathematics', icon: GraduationCap },
    { id: 'resources', label: 'Resources', icon: CalendarDays },
  ] as const

  if (!authReady) return <div className="loading-screen"><div className="loader" />Preparing your study space…</div>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><GraduationCap size={23} /></div><span>Study<span className="brand-light">Space</span></span><button className="mobile-close icon-btn" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={19}/></button></div>
      <div className="side-label">WORKSPACE</div>
      <nav>{navItems.map(item => <button key={item.id} className={`nav-link ${section === item.id ? 'nav-active' : ''}`} onClick={() => { setSection(item.id); setActiveChapter(null); setMobileMenu(false) }}><item.icon size={18}/><span>{item.label}</span>{section === item.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="focus-card"><div className="focus-icon"><Sparkles size={16}/></div><strong>Stay focused</strong><p>Small steps every day lead to big results.</p></div><div className="profile-row"><div className="avatar">S</div><div className="profile-copy"><strong>Student account</strong><span>Learning dashboard</span></div><span className="online-dot"/></div></div>
    </aside>
    {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileMenu(true)} aria-label="Open menu">☰</button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <span>{activeChapter || navItems.find(n => n.id === section)?.label}</span></div><div className="topbar-right"><span className="date-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>{session && <button className="logout-btn" onClick={signOut}><LogOut size={16}/> <span>Logout</span></button>}</div></header>
      <div className="page-content">
        {section === 'dashboard' && !activeChapter && <Dashboard greeting={greeting} onOpen={(s) => { setSection(s); setActiveChapter(null) }} onChapter={(c) => { setSection('physics'); setActiveChapter(c) }}/>}
        {section === 'physics' && !activeChapter && <PhysicsPage onChapter={setActiveChapter}/>}
        {section === 'chemistry' && <SubjectPage title="Chemistry" subtitle="Build strong concepts, one reaction at a time." icon="⚗️" topics={['Solutions','Electrochemistry','Chemical Kinetics','d- and f-Block Elements','Coordination Compounds','Haloalkanes and Haloarenes']}/>}
        {section === 'maths' && <SubjectPage title="Mathematics" subtitle="Practice consistently. Progress follows." icon="∑" topics={['Relations and Functions','Inverse Trigonometric Functions','Matrices','Determinants','Continuity and Differentiability','Integrals']}/>}
        {section === 'resources' && <ResourcesPage/>}
        {section === 'physics' && activeChapter && <ChapterPage chapter={chapters.find(c => c.title === activeChapter)!} onBack={() => setActiveChapter(null)} session={session} onLogin={() => setActiveChapter('Alternating Current')} />}
      </div>
      <footer className="footer">© 2026 StudySpace <span>Designed for focused learning</span></footer>
    </main>
  </div>
}

function Dashboard({ greeting, onOpen, onChapter }: { greeting: string; onOpen: (s: 'physics'|'chemistry'|'maths'|'resources') => void; onChapter: (c: string) => void }) {
  return <><section className="welcome-banner"><div className="welcome-copy"><div className="eyebrow"><span className="eyebrow-dot"/> YOUR LEARNING JOURNEY</div><h1>{greeting},<br/><span>ready to make progress?</span></h1><p>Your personal space to learn, revise and achieve your goals.</p><button className="primary-btn" onClick={() => onOpen('physics')}>Explore your subjects <ChevronRight size={17}/></button></div><div className="welcome-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="book-illustration"><BookOpen size={68} strokeWidth={1.2}/></div><div className="float-tag tag-top"><CheckCircle2 size={15}/> Keep going!</div><div className="float-tag tag-bottom"><Sparkles size={15}/> One day at a time</div></div></section>
    <div className="section-heading"><div><div className="eyebrow muted">YOUR CLASSROOM</div><h2>Subjects</h2></div><button className="text-link" onClick={() => onOpen('resources')}>View resources <ChevronRight size={15}/></button></div>
    <div className="subject-grid"><SubjectCard icon="⚛" name="Physics" detail="5 chapters available" color="blue" progress="Concepts & numericals" onClick={() => onOpen('physics')}/><SubjectCard icon="⚗" name="Chemistry" detail="6 topics to explore" color="purple" progress="Reactions & theory" onClick={() => onOpen('chemistry')}/><SubjectCard icon="∑" name="Mathematics" detail="6 topics to explore" color="green" progress="Practice & problem solving" onClick={() => onOpen('maths')}/></div>
    <div className="dashboard-columns"><section className="panel timetable-panel"><div className="panel-heading"><div><div className="eyebrow muted">PLAN YOUR DAY</div><h3>Study timetable</h3></div><span className="soft-icon"><CalendarDays size={18}/></span></div><div className="schedule-list">{timetable.map((row,i)=><div className="schedule-row" key={row[0]}><div className="schedule-time">{row[0]}</div><div className={`schedule-marker marker-${i}`}/><div className="schedule-detail"><strong>{row[1]}</strong><span>{row[2]}</span></div></div>)}</div><div className="panel-footnote"><Clock3 size={14}/> A sample timetable — adjust it to your routine.</div></section>
    <section className="panel notes-panel"><div className="panel-heading"><div><div className="eyebrow muted">PICK UP WHERE YOU LEFT OFF</div><h3>Notes library</h3></div><span className="soft-icon"><BookOpen size={18}/></span></div><div className="featured-note"><div className="note-symbol">Φ</div><div><span className="note-category">PHYSICS · ELECTRICITY</span><strong>Alternating Current</strong><span className="note-meta">Study notes + private room</span></div><ChevronRight size={18}/></div><button className="outline-btn full-btn" onClick={() => onChapter('Alternating Current')}>Open chapter <ChevronRight size={16}/></button></section></div>
  </>
}
function SubjectCard({icon,name,detail,color,progress,onClick}:{icon:string;name:string;detail:string;color:string;progress:string;onClick:()=>void}) {
  return <button className="subject-card" onClick={onClick}><div className={`subject-icon ${color}`}>{icon}</div><div className="subject-title-row"><h3>{name}</h3><ChevronRight size={17}/></div><p>{detail}</p><div className="subject-progress"><span>{progress}</span><div className="progress-track"><i/></div></div></button>
}
function PhysicsPage({onChapter}:{onChapter:(c:string)=>void}) {
  return <><PageIntro eyebrow="SCIENCE / PHYSICS" title="Physics notes" subtitle="Choose a chapter to review key concepts and formulas."/><div className="chapter-grid">{chapters.map((c,i)=><button className="chapter-card" key={c.title} onClick={()=>onChapter(c.title)}><div className="chapter-number">0{i+1}</div><div className="chapter-content"><span className="chapter-topic">{c.topic}</span><h3>{c.title}</h3><p>{c.summary}</p><span className="chapter-open">Open chapter <ChevronRight size={15}/></span></div></button>)}</div></>
}
function ChapterPage({chapter,onBack,session,onLogin}:{chapter:NonNullable<ReturnType<typeof chapters.find>>;onBack:()=>void;session:Session|null;onLogin:()=>void}) {
  const isPrivate = chapter.title === 'Alternating Current'
  return <><button className="back-link" onClick={onBack}>← Back to Physics</button><PageIntro eyebrow={`PHYSICS / ${chapter.topic.toUpperCase()}`} title={chapter.title} subtitle={chapter.summary}/>{isPrivate ? <PrivateChat session={session} onLogin={onLogin}/> : <div className="notes-layout"><section className="panel notes-content"><div className="panel-heading"><div><div className="eyebrow muted">QUICK REVISION</div><h3>Key concepts & formulas</h3></div><span className="soft-icon"><BookOpen size={18}/></span></div><ol className="concept-list">{chapter.points.map((p,i)=><li key={p}><span>{String(i+1).padStart(2,'0')}</span><p>{p}</p></li>)}</ol><div className="study-tip"><Sparkles size={17}/><p><strong>Study tip</strong> Try explaining each concept in your own words, then solve a few related problems.</p></div></section><aside className="panel side-note"><div className="soft-icon"><CheckCircle2 size={18}/></div><h3>Revision checklist</h3><p>Use this quick checklist as you study.</p>{['Read each concept','Write important formulas','Attempt practice questions','Review mistakes'].map(x=><label className="check-row" key={x}><input type="checkbox"/>{x}</label>)}</aside></div>}</>
}
function PrivateChat({session,onLogin}:{session:Session|null;onLogin:()=>void}) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState('')
  return <section className="private-gate">{!session ? <div className="auth-card"><div className="auth-lock"><LockKeyhole size={24}/></div><div className="eyebrow muted">RESTRICTED STUDY ROOM</div><h2>Private access only</h2><p>This chapter includes a private one-to-one messaging room. Sign in with one of the two accounts authorized by the StudySpace administrator.</p><form onSubmit={async e=>{e.preventDefault();setError('');if(!supabase)return;const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)setError(error.message);else{setPassword('');onLogin()}}} className="auth-form"><label>Email address<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>{error&&<div className="error-text">{error}</div>}<button className="primary-btn full-btn" type="submit">Sign in securely <ChevronRight size={16}/></button></form><div className="security-note"><ShieldCheck size={15}/> Access is enforced by Supabase authentication and database policies.</div></div> : <ChatRoom/>}</section>
}
function ChatRoom() {
  const [items,setItems]=useState<Message[]>([]); const [draft,setDraft]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [urls,setUrls]=useState<Record<string,string>>({})
  const [uid,setUid]=useState('')
  useEffect(()=>{if(!supabase)return;supabase.auth.getUser().then(({data})=>setUid(data.user?.id||''))},[])
  useEffect(()=>{if(!supabase)return;let live=true;const load=async()=>{const {data,error}=await supabase!.from('private_messages').select('*').order('created_at',{ascending:true}).limit(300);if(!live)return;if(error){setError(error.message);return}const rows=(data||[]) as Message[];setItems(rows);const next:Record<string,string>={};for(const m of rows){if(m.image_path){const {data:s}=await supabase!.storage.from('private-chat-photos').createSignedUrl(m.image_path,3600);if(s?.signedUrl)next[m.image_path]=s.signedUrl}}if(live)setUrls(next)};void load();const channel=supabase.channel('private-room-live').on('postgres_changes',{event:'*',schema:'public',table:'private_messages'},()=>void load()).subscribe();return()=>{live=false;void supabase!.removeChannel(channel)}},[])
  async function send(e:FormEvent){e.preventDefault();if(!supabase||!uid||!draft.trim())return;setBusy(true);const {data:members,error:me}=await supabase.from('private_chat_members').select('user_id');const recipient=members?.find(m=>m.user_id!==uid)?.user_id;if(me||!recipient){setError(me?.message||'Second authorized account is not configured.');setBusy(false);return}const {error}=await supabase.from('private_messages').insert({sender_id:uid,recipient_id:recipient,body:draft.trim()});if(error)setError(error.message);else setDraft('');setBusy(false)}
  async function photo(file?:File){if(!supabase||!uid||!file)return;if(!file.type.startsWith('image/')||file.size>8*1024*1024){setError('Choose an image smaller than 8 MB.');return}setBusy(true);const path=`${uid}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:up}=await supabase.storage.from('private-chat-photos').upload(path,file,{contentType:file.type});if(up)setError(up.message);else{const {data:members}=await supabase.from('private_chat_members').select('user_id');const recipient=members?.find(m=>m.user_id!==uid)?.user_id;if(recipient){const {error}=await supabase.from('private_messages').insert({sender_id:uid,recipient_id:recipient,image_path:path});if(error)setError(error.message)}else setError('Second authorized account is not configured.')}setBusy(false)}
  async function remove(m:Message){if(!supabase||m.sender_id!==uid)return;const {error}=await supabase.from('private_messages').delete().eq('id',m.id);if(error)setError(error.message);else if(m.image_path)await supabase.storage.from('private-chat-photos').remove([m.image_path])}
  return <div className="chat-panel"><div className="chat-header"><div className="chat-avatar"><MessageCircle size={19}/></div><div><strong>Private conversation</strong><span><i/> Two-account room · realtime</span></div><span className="encrypted-label"><ShieldCheck size={14}/> Private</span></div><div className="chat-notice">Only the two account IDs added to the authorized members table can read or send messages here.</div><div className="message-list">{items.length===0&&<div className="empty-chat"><div className="empty-chat-icon"><MessageCircle size={23}/></div><strong>Your conversation starts here</strong><span>Messages sent by either authorized account will appear here.</span></div>}{items.map(m=><div className={`message-row ${m.sender_id===uid?'mine':''}`} key={m.id}><div className="message-bubble">{m.body&&<p>{m.body}</p>}{m.image_path&&urls[m.image_path]&&<a href={urls[m.image_path]} target="_blank" rel="noreferrer"><img className="chat-photo" src={urls[m.image_path]} alt="Shared attachment"/></a>}<div className="message-meta"><time>{formatTime(m.created_at)}</time>{m.sender_id===uid&&<button onClick={()=>void remove(m)} title="Delete your message" aria-label="Delete message"><Trash2 size={13}/></button>}</div></div></div>)}</div>{error&&<div className="chat-error">{error}</div>}<form className="chat-compose" onSubmit={send}><label className="attach-btn" title="Share a photo"><Upload size={18}/><input type="file" accept="image/*" onChange={e=>{void photo(e.target.files?.[0]);e.currentTarget.value=''}}/></label><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a private message…" aria-label="Message" maxLength={4000}/><button className="send-btn" disabled={busy||!draft.trim()} aria-label="Send message"><Send size={17}/></button></form><div className="chat-footnote"><Paperclip size={12}/> Images up to 8 MB · Delete is available for messages you sent</div></div>
}
function SubjectPage({title,subtitle,icon,topics}:{title:string;subtitle:string;icon:string;topics:string[]}) {
  return <><PageIntro eyebrow="YOUR CLASSROOM" title={title} subtitle={subtitle}/><div className="subject-detail-grid">{topics.map((t,i)=><div className="topic-card" key={t}><div className="topic-icon">{icon}</div><div><span>TOPIC {String(i+1).padStart(2,'0')}</span><h3>{t}</h3><p>Organize your revision and practice for this topic.</p></div><span className="coming-soon">Study plan</span></div>)}</div><div className="info-banner"><Sparkles size={18}/><p><strong>Your learning space is ready.</strong> Add your own class notes and resources as you build out these subjects.</p></div></>
}
function ResourcesPage() {
  return <><PageIntro eyebrow="LEARNING TOOLKIT" title="Study resources" subtitle="A few useful ways to make each study session count."/><div className="resource-grid"><div className="resource-card"><div className="resource-icon blue"><CalendarDays/></div><h3>Weekly planning</h3><p>Break large topics into smaller, realistic study sessions and leave room for revision.</p></div><div className="resource-card"><div className="resource-icon purple"><BookOpen/></div><h3>Active recall</h3><p>Close your notes and retrieve key ideas from memory before checking your understanding.</p></div><div className="resource-card"><div className="resource-icon green"><CheckCircle2/></div><h3>Practice tracker</h3><p>Record questions attempted, mistakes found and concepts to revisit next time.</p></div></div><section className="panel resource-timetable"><h3>Suggested study rhythm</h3><div className="rhythm-row"><span>01</span><strong>Learn</strong><p>Understand one concept without rushing.</p></div><div className="rhythm-row"><span>02</span><strong>Recall</strong><p>Summarize the idea without looking at notes.</p></div><div className="rhythm-row"><span>03</span><strong>Practice</strong><p>Apply it to questions and review errors.</p></div></section></>
}
function PageIntro({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}) {
  return <div className="page-intro"><div className="eyebrow muted">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>
}
