"""Inspect actual browser downloads. This is not a Hancom reference comparison."""
import json
import sys
from pathlib import Path
from pypdf import PdfReader
import fitz

folder=Path(sys.argv[1]);results=[]
for path in sorted(folder.glob('*.pdf')):
    reader=PdfReader(path);doc=fitz.open(path)
    assert len(reader.pages)>0,path
    images=[len(list(p.images)) for p in reader.pages]
    text=sum(len(p.extract_text() or '') for p in reader.pages)
    if path.name!='test-image.hwpx.pdf':
        assert sum(images)==0,(path.name,'unexpected rasterized document/picture',images)
    else:
        assert len(reader.pages)==5
        assert sum(images)>=5,(path.name,'original raster pictures lost')
    if path.name=='svg_picture_repro.hwpx.pdf':
        assert len(reader.pages)==3
        assert len(doc[0].get_drawings())>=25,'embedded SVG shapes disappeared'
    visible=[]
    for i,page in enumerate(doc):
        pix=page.get_pixmap(matrix=fitz.Matrix(1,1),alpha=False)
        pix.save(folder/(path.stem+'-'+str(i+1)+'.png'))
        pixels=pix.samples
        dark=sum(1 for j in range(0,len(pixels),3) if min(pixels[j:j+3])<160)
        assert dark>20,(path.name,i+1,'empty rendered page')
        visible.append(dark)
    results.append(dict(file=path.name,pages=len(reader.pages),textCharacters=text,images=images,visiblePixels=visible))
assert len(results)==6,results
(folder/'PDF_CHECK.json').write_text(json.dumps(dict(status='PASS',results=results,hancomReferenceEquivalence='NOT_VERIFIED'),indent=2))
print(json.dumps(results,indent=2))
