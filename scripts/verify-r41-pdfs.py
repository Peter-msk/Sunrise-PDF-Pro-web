from pathlib import Path
import json,sys
from pypdf import PdfReader
root=Path(sys.argv[1]);results={}
for ext in ('xls','xlsx','jpg','png'):
    pdf=PdfReader(root/(ext+'.pdf'),strict=True)
    text=''.join(p.extract_text() or '' for p in pdf.pages)
    if ext in ('xls','xlsx'):
        assert len(pdf.pages)==3
        assert all(not len(p.images) for p in pdf.pages)
        assert '매출 현황' in text and '서울 70' in text and '2,982,000' in text
        assert '숨김 내용' not in text
    else:
        assert len(pdf.pages)==1 and len(pdf.pages[0].images)==1
        if ext=='jpg':
            assert pdf.pages[0].mediabox.height>pdf.pages[0].mediabox.width
            assert pdf.pages[0].images[0].image.size==(200,400)
        else:
            objects=pdf.pages[0]['/Resources']['/XObject'].values()
            assert any('/SMask' in ref.get_object() for ref in objects)
    results[ext]={'pages':len(pdf.pages),'characters':len(text),'status':'PASS'}
(root/'PDF_CHECK.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
