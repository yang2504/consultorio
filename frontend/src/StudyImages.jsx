import { useState } from 'react';
import { Expand, ImagePlus, Images } from 'lucide-react';
import { Dialog } from './Forms.jsx';
import { clock, longDate, specialties } from './clinic.js';

const url = id => '/api/attachments/' + id;
const uploadDate = value => new Date(value).toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

export function StudyImages({ entries, add }) {
  const [preview, setPreview] = useState(null);
  const groups = Object.entries({ ...specialties, sinEspecialidad: { name: 'Sin especialidad registrada', icon: Images } })
    .map(([id, meta]) => ({ id, meta, studies: entries.filter(entry => (entry.specialty ?? 'sinEspecialidad') === id && entry.attachments.length) }))
    .filter(group => group.studies.length);

  return <section className="study-images" aria-labelledby="study-images-title">
    <div className="study-images-heading">
      <div><h3 id="study-images-title">Imágenes diagnósticas</h3><p>Radiografías e imágenes agrupadas por especialidad y estudio.</p></div>
      <button type="button" className="primary" onClick={() => add()}><ImagePlus size={18} /> Cargar imágenes</button>
    </div>
    {groups.length === 0 && <div className="study-empty"><Images size={21} /> Aún no hay imágenes en este expediente.</div>}
    {groups.map(({ id, meta, studies }) => <section key={id} className="study-group" aria-label={'Imágenes de ' + meta.name}>
      <header><span className={'study-icon ' + id}><meta.icon size={20} /></span><h4>{meta.name}</h4>
        <small>{studies.length} {studies.length === 1 ? 'registro' : 'registros'}</small>
        {id !== 'sinEspecialidad' && <button className="text-button" type="button" onClick={() => add(id)}>Cargar imágenes de {meta.name}</button>}
      </header>
      {studies.map(study => <article className="study-row" key={study.id}>
        <div className="study-detail">
          <h5>{study.title}</h5>
          <dl>
            {study.study_day && <><dt>Fecha del estudio</dt><dd>{longDate(study.study_day)}</dd></>}
            <dt>Cargado por</dt><dd>{study.author} · {uploadDate(study.created_at)}</dd>
            {study.appointment_id && <><dt>Cita vinculada</dt><dd>{study.appointment_day
              ? longDate(study.appointment_day) + ' · ' + clock(study.appointment_start)
              : '#' + study.appointment_id}</dd></>}
          </dl>
          {study.body && <p>{study.body}</p>}
        </div>
        <div className="study-thumbnails">{study.attachments.map(file =>
          <button type="button" key={file.id} onClick={() => setPreview(file)} aria-label={'Ampliar ' + file.name}>
            <img src={url(file.id)} alt="" loading="lazy" /><span><Expand size={14} />{file.name}</span>
          </button>)}</div>
      </article>)}
    </section>)}
    {preview && <Dialog title={preview.name} close={() => setPreview(null)} className="image-dialog">
      <img src={url(preview.id)} alt={preview.name} />
      <a href={url(preview.id)} className="text-button" target="_blank" rel="noreferrer">Abrir imagen original</a>
    </Dialog>}
  </section>;
}
