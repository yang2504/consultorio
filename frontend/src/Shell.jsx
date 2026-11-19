import { useState } from 'react';
import { Activity, BarChart3, Bell, CalendarDays, ChevronDown, ChevronRight, FolderOpen, House, Layers3, LogOut, Menu, Settings, UserRound, Users, X } from 'lucide-react';
import { clinical, clock, roles, specialties, today, visitLabel } from './clinic.js';
import { Form } from './Forms.jsx';
import { api } from './api.js';

export function Brand() {
  return <div className="brand"><img className="brand-icon" src="/caduceo.svg" alt="" width="64" height="64" /><div className="brand-copy"><strong>Dr. Teeddy Cuiza Vera</strong><span className="brand-specialty">Cirujano general</span><span className="brand-caption">Consultorio médico</span></div></div>;
}

export function SignIn({ config, accept }) {
  const { needsSetup, demo } = config;
  return <main className="signin">
    <section className="signin-card panel">
      <Brand />
      <h1>{needsSetup ? 'Configura tu consultorio' : demo ? 'Explora el consultorio' : 'Inicia sesión'}</h1>
      <p>{needsSetup ? 'Crea la cuenta de administración. El código aparece en la ventana del lanzador.' :
        demo ? 'Consulta la agenda y los expedientes con datos ficticios. Los cambios se borran al cerrar.' : 'Accede a tu espacio de trabajo.'}</p>
      <Form label={needsSetup ? 'Crear cuenta' : demo ? 'Entrar a la demostración' : 'Ingresar'}
        save={async body => accept(await api(needsSetup ? '/setup' : demo ? '/demo' : '/login', { method: 'POST', body }))}>
        {needsSetup && <><label>Código de configuración<input name="code" required autoComplete="off" /></label><label>Nombre completo<input name="name" required maxLength={120} autoComplete="name" /></label></>}
        {!demo && <>
          <label>Usuario<input name="username" autoComplete="username" required maxLength={60} /></label>
          <label>Contraseña<input name="password" type="password" autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 8 : undefined} required maxLength={128} /></label>
        </>}
      </Form>
    </section>
  </main>;
}

export function Shell({ user, demo, route, go, logout, children, appointments, openAppointment }) {
  const [mobile, setMobile] = useState(false);
  const [expanded, setExpanded] = useState(route.startsWith('especialidades'));
  const [popover, setPopover] = useState('');
  const nav = [
    ['inicio', 'Inicio', House],
    ['citas', 'Citas', CalendarDays],
    ...(user.role === 'tecnico' ? [] : [['pacientes', 'Pacientes', Users]]),
    ...(clinical(user) ? [['historial', 'Historial médico', FolderOpen]] : []),
    ...(user.role === 'tecnico' ? [] : [['reportes', 'Reportes', BarChart3]]),
    ...(user.role === 'administrador' ? [['configuracion', 'Configuración', Settings]] : []),
    ['especialidades', 'Especialidades', Layers3]
  ];
  const sameDay = appointments.filter(a => a.day === today() && !['completada', 'cancelada'].includes(a.status));
  const select = path => { setMobile(false); setPopover(''); go(path); };

  return <div className="layout">
    {mobile && <button className="mobile-overlay" aria-label="Cerrar menú" onClick={() => setMobile(false)} />}
    <aside className={'sidebar' + (mobile ? ' mobile-open' : '')}>
      <Brand />
      <nav aria-label="Navegación principal">
        {nav.map(([path, label, Icon]) => {
          const active = route.split('/')[0] === path;
          if (path === 'especialidades') return <div key={path}>
            <button className={'nav-item' + (active ? ' active' : '')} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              <Icon size={20} /><span>{label}</span>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {expanded && <div className="nav-submenu">{Object.entries(specialties).map(([id, item]) => <button key={id}
              aria-current={route === path + '/' + id ? 'page' : undefined} onClick={() => select(path + '/' + id)}>{item.name}</button>)}</div>}
          </div>;
          return <button key={path} className={'nav-item' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={() => select(path)}><Icon size={20} /><span>{label}</span></button>;
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="local-label"><span />{demo ? 'Modo demostración' : 'Conexión local'}</div>
        <button className="nav-item logout" onClick={logout}><LogOut size={19} /><span>Cerrar sesión</span></button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button menu-button" aria-label={mobile ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMobile(!mobile)}>{mobile ? <X size={21} /> : <Menu size={21} />}</button>
        <div className="greeting"><h1>Bienvenido, <span>{user.name}</span></h1><p>Agenda y atención del consultorio</p></div>
        <div className="top-actions">
          <button className="bell icon-button" aria-label="Agenda de hoy" aria-expanded={popover === 'agenda'} onClick={() => setPopover(popover === 'agenda' ? '' : 'agenda')}><Bell size={22} />{sameDay.length > 0 && <i />}</button>
          <button className="profile" aria-label="Menú de usuario" aria-expanded={popover === 'perfil'} onClick={() => setPopover(popover === 'perfil' ? '' : 'perfil')}>
            <span className="avatar"><UserRound size={23} /></span><span className="profile-name"><strong>{user.name}</strong><small>{roles[user.role]}</small></span><ChevronDown size={16} />
          </button>
          {popover === 'agenda' && <div className="popover panel"><h3>Agenda de hoy</h3>{sameDay.map(a => <button key={a.id} className="text-button" onClick={() => { setPopover(''); openAppointment(a); }}>
            <Activity size={15} /> {clock(a.start)} · {visitLabel(a)} · {a.patient}
          </button>)}{!sameDay.length && <p className="muted">No hay citas pendientes para hoy.</p>}</div>}
          {popover === 'perfil' && <div className="popover panel"><h3>{user.name}</h3><p className="muted">{roles[user.role]}</p><button className="text-button" onClick={logout}><LogOut size={17} /> Cerrar sesión</button></div>}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
