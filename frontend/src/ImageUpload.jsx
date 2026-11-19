import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

const maxBytes = 5 * 1024 * 1024;
const validType = file => ['image/jpeg', 'image/png'].includes(file.type);
const fileKey = file => [file.name, file.size, file.lastModified].join('|');

export function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mime: file.type, data: reader.result.split(',')[1] });
    reader.onerror = () => reject(new Error('No se pudo leer ' + file.name + '.'));
    reader.readAsDataURL(file);
  });
}

function Preview({ file, remove }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return <li className="upload-preview">
    {url && <img src={url} alt="" />}
    <span>{file.name}</span>
    <button type="button" className="icon-button" aria-label={'Quitar ' + file.name} onClick={remove}><X size={16} /></button>
  </li>;
}

export function ImageUpload({ files, onChange, required }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  function add(incoming) {
    const next = new Map(files.map(file => [fileKey(file), file]));
    const errors = [];
    for (const file of incoming) {
      if (!validType(file) || file.size === 0 || file.size > maxBytes) {
        errors.push(file.name + ' debe ser un JPG o PNG de hasta 5 MB.');
      } else if (!next.has(fileKey(file))) {
        if (next.size < 4) next.set(fileKey(file), file);
        else errors.push('Puedes guardar hasta cuatro imágenes por estudio.');
      }
    }
    setError([...new Set(errors)].join(' '));
    onChange([...next.values()]);
  }

  function drop(event) {
    event.preventDefault();
    setDragging(false);
    if (!event.currentTarget.closest('fieldset')?.disabled) add(event.dataTransfer.files);
  }

  return <div className="upload" role="group" aria-label="Imágenes del estudio">
    <div className={'upload-zone' + (dragging ? ' dragging' : '')} onDragOver={event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    }} onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    }} onDrop={drop}>
      <ImagePlus size={27} aria-hidden="true" />
      <strong>Arrastra y suelta tus imágenes</strong>
      <small>JPG o PNG · Hasta 4 archivos de 5 MB cada uno</small>
      <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png" onChange={event => {
        add(event.target.files);
        event.target.value = '';
      }} />
      <button type="button" className="secondary" onClick={() => input.current?.click()}>Seleccionar archivos</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="upload-files">
      {files.map(file => <Preview key={fileKey(file)} file={file} remove={() => {
        setError('');
        onChange(files.filter(item => item !== file));
      }} />)}
    </ul>}
    {required && files.length === 0 && <small className="muted">Adjunta al menos una imagen para guardar el estudio.</small>}
  </div>;
}
