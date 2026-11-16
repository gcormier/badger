// 3MF writer: one build item = an assembly whose components are the Case and Logo meshes,
// so slicers load it as a single object with two parts. Bambu Studio's
// Metadata/model_settings.config pre-assigns extruders (case → 1, logo → 2).
import { zipSync, strToU8 } from 'fflate';

export interface MeshData {
  name: string;
  /** xyz triplets */
  positions: Float32Array;
  /** triangle vertex indices */
  indices: Uint32Array;
  color: string; // #RRGGBB
  extruder: number;
}

export interface ThreeMFOptions {
  title?: string;
  bambuConfig?: boolean;
}

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const fmt = (v: number) => {
  const r = Math.round(v * 1e5) / 1e5;
  return (Object.is(r, -0) ? 0 : r).toString();
};
const color = (c: string) => {
  const h = c.replace('#', '').toUpperCase();
  return '#' + (h.length === 6 ? h + 'FF' : h);
};

function meshXml(m: MeshData, id: number, pid: number, pindex: number): string {
  const parts: string[] = [];
  parts.push(`  <object id="${id}" name="${esc(m.name)}" type="model" pid="${pid}" pindex="${pindex}">\n   <mesh>\n    <vertices>\n`);
  const p = m.positions;
  let chunk = '';
  for (let i = 0; i < p.length; i += 3) {
    chunk += `     <vertex x="${fmt(p[i])}" y="${fmt(p[i + 1])}" z="${fmt(p[i + 2])}"/>\n`;
    if (chunk.length > 1 << 16) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk, '    </vertices>\n    <triangles>\n');
  chunk = '';
  const t = m.indices;
  for (let i = 0; i < t.length; i += 3) {
    chunk += `     <triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>\n`;
    if (chunk.length > 1 << 16) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk, '    </triangles>\n   </mesh>\n  </object>\n');
  return parts.join('');
}

export function build3MF(meshes: MeshData[], opts: ThreeMFOptions = {}): Uint8Array {
  const title = opts.title ?? 'Badge Holder';
  const matId = 1;
  const meshIds = meshes.map((_, i) => i + 2);
  const asmId = meshes.length + 2;

  const model: string[] = [];
  model.push(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">${esc(title)}</metadata>
 <metadata name="Application">badger</metadata>
 <resources>
  <basematerials id="${matId}">
${meshes.map(m => `   <base name="${esc(m.name)}" displaycolor="${color(m.color)}"/>`).join('\n')}
  </basematerials>
`);
  meshes.forEach((m, i) => model.push(meshXml(m, meshIds[i], matId, i)));
  model.push(`  <object id="${asmId}" name="${esc(title)}" type="model">
   <components>
${meshIds.map(id => `    <component objectid="${id}"/>`).join('\n')}
   </components>
  </object>
 </resources>
 <build>
  <item objectid="${asmId}"/>
 </build>
</model>
`);

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="config" ContentType="text/xml"/>
</Types>
`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`),
    '3D/3dmodel.model': strToU8(model.join('')),
  };

  if (opts.bambuConfig !== false) {
    files['Metadata/model_settings.config'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${asmId}">
    <metadata key="name" value="${esc(title)}"/>
    <metadata key="extruder" value="${meshes[0]?.extruder ?? 1}"/>
${meshes.map((m, i) => `    <part id="${meshIds[i]}" subtype="normal_part">
      <metadata key="name" value="${esc(m.name)}"/>
      <metadata key="extruder" value="${m.extruder}"/>
    </part>`).join('\n')}
  </object>
</config>
`);
  }
  return zipSync(files, { level: 6 });
}
