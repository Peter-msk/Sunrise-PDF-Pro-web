"""Synthetic XLS/XLSX native-layout feasibility check, not a web upload service.

Uses only programmatically generated examples. The current host does not allow
production namespace isolation; never point this script at private user files.
LibreOffice output is a candidate, not evidence of Microsoft Excel equivalence.
"""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import fitz
from PIL import Image,ImageDraw
from openpyxl import Workbook
from openpyxl.chart import BarChart,Reference
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image as SheetImage
from openpyxl.styles import Alignment,Border,Font,PatternFill,Side

folder=Path(sys.argv[1]).resolve();folder.mkdir(parents=True,exist_ok=True)
exe=shutil.which('soffice');assert exe,'soffice is required for this local feasibility check'
wb=Workbook();ws=wb.active;ws.title='매출 현황'
ws.merge_cells('A1:J2');ws['A1']='SUNRISE 원본 서식 검토';ws['A1'].font=Font(name='NanumGothic',size=22,bold=True,color='FFFFFF');ws['A1'].fill=PatternFill('solid',fgColor='163B64');ws['A1'].alignment=Alignment(vertical='center')
for row in ws['A1:J2']:
    for c in row:c.fill=PatternFill('solid',fgColor='163B64')
for col,value in enumerate(['월','계약 건수','공급가액','부가세','합계'],1):ws.cell(4,col,value)
for i in range(1,13):
    r=i+4
    for col,value in enumerate([f'{i}월',i+2,i*123000,f'=C{r}*0.1',f'=SUM(C{r}:D{r})'],1):ws.cell(r,col,value)
    for c in ws[r][:5]:
        c.font=Font(name='NanumGothic',size=11)
        c.fill=PatternFill('solid',fgColor='EAF3FF' if i%2 else 'FFFFFF')
        c.border=Border(bottom=Side(style='thin',color='B8CDE4'))
    for c in ws[r][2:5]:c.number_format='#,##0"원"'
for c in ws[4][:5]:c.font=Font(name='NanumGothic',bold=True,color='FFFFFF');c.fill=PatternFill('solid',fgColor='2877CC')
ws['A18']='합계';ws['E18']='=SUM(E5:E16)';ws['E18'].number_format='#,##0"원"';ws['E18'].font=Font(name='NanumGothic',bold=True,color='B73030')
ws['K40']='MUST_NOT_PRINT_OUTSIDE_AREA'
chart=BarChart();chart.title='월별 계약금액';chart.add_data(Reference(ws,min_col=3,min_row=4,max_row=16),titles_from_data=True);chart.set_categories(Reference(ws,min_col=1,min_row=5,max_row=16));chart.width=11.5;chart.height=6.5;ws.add_chart(chart,'G4')
im=Image.new('RGB',(320,80),'#163B64');dr=ImageDraw.Draw(im);dr.rectangle((15,15,65,65),fill='#38A2FF');dr.text((80,30),'SUNRISE PDF PRO',fill='white');buf=io.BytesIO();im.save(buf,format='PNG');buf.seek(0);logo=SheetImage(buf);logo.width=240;logo.height=60;ws.add_image(logo,'G18')
for col in 'ABCDEFGHIJ':ws.column_dimensions[col].width=12
ws.column_dimensions['A'].width=9
for col in 'CDE':ws.column_dimensions[col].width=18
ws.page_setup.orientation='landscape';ws.page_setup.paperSize=ws.PAPERSIZE_A4;ws.page_setup.fitToWidth=1;ws.page_setup.fitToHeight=1;ws.sheet_properties.pageSetUpPr.fitToPage=True;ws.print_area='A1:J23'
ws.oddHeader.center.text='SUNRISE_HEADER';ws.oddFooter.center.text='SUNRISE_FOOTER &P / &N'
detail=wb.create_sheet('세부 검토');detail['A1']='Portrait worksheet';detail['A1'].font=Font(name='NanumGothic',size=20,bold=True);detail.merge_cells('A1:F2');detail['A4']='WRAPPED_TEXT';detail['A5']='A deliberately wrapped text box in a merged spreadsheet cell.';detail.merge_cells('A5:C8');detail['A5'].alignment=Alignment(wrap_text=True,vertical='top');detail['A5'].fill=PatternFill('solid',fgColor='FFF0BF');detail['A10']='NOTE_ANCHOR';detail['A10'].comment=Comment('SOURCE_CELL_COMMENT','Sunrise synthetic fixture');detail.print_area='A1:F16';detail.page_setup.orientation='portrait';detail.page_setup.paperSize=detail.PAPERSIZE_A4;detail.page_setup.fitToWidth=1;detail.page_setup.fitToHeight=1;detail.sheet_properties.pageSetUpPr.fitToPage=True;detail.oddHeader.center.text='PORTRAIT_HEADER';detail.oddFooter.center.text='PORTRAIT_FOOTER &P'
hidden=wb.create_sheet('숨김');hidden['A1']='MUST_NOT_PRINT_HIDDEN';hidden.sheet_state='hidden'
xlsx=folder/'styled-layout.xlsx';wb.save(xlsx)
version=subprocess.check_output([exe,'--version'],text=True).strip()
logs=[]
def convert(source,outdir,filter_name):
    outdir.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sunrise-office-fixture-') as work:
        profile=Path(work)/'profile';(profile/'user').mkdir(parents=True)
        (profile/'user/registrymodifications.xcu').write_text('''<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>''')
        args=[exe,'-env:UserInstallation='+profile.as_uri(),'--headless','--nologo','--nodefault','--norestore','--convert-to',filter_name,'--outdir',str(outdir),str(source)]
        fonts=(Path(__file__).resolve().parent.parent/'browser-local/public/fonts').as_posix()
        config=Path(work)/'fonts.conf'
        config.write_text('<fontconfig><include>/etc/fonts/fonts.conf</include><dir>'+fonts+'</dir><cachedir>'+work+'/font-cache</cachedir></fontconfig>')
        env={**os.environ,'FONTCONFIG_FILE':str(config)}
        result=subprocess.run(args,capture_output=True,text=True,timeout=60,check=False,env=env)
        logs.append(dict(input=source.name,filter=filter_name,returncode=result.returncode,stdout=result.stdout.strip(),stderr=result.stderr.strip()))
        assert result.returncode==0,logs[-1]
pdf_filter='pdf:calc_pdf_Export:{"UseLosslessCompression":{"type":"boolean","value":"true"},"ReduceImageResolution":{"type":"boolean","value":"false"},"SinglePageSheets":{"type":"boolean","value":"false"}}'
convert(xlsx,folder/'xls','xls:MS Excel 97')
xls=folder/'xls/styled-layout.xls';assert xls.is_file()
convert(xlsx,folder/'xlsx-pdf',pdf_filter);convert(xls,folder/'xls-pdf',pdf_filter)
checks=[]
for kind in ['xlsx','xls']:
    pdf=folder/(kind+'-pdf/styled-layout.pdf');doc=fitz.open(pdf)
    text='\n'.join(p.get_text() for p in doc)
    for expected in ['SUNRISE_HEADER','SUNRISE_FOOTER','PORTRAIT_HEADER','PORTRAIT_FOOTER','Portrait worksheet','WRAPPED_TEXT']:
        assert expected in text,(kind,expected)
    assert '###' not in text,(kind,'numeric overflow')
    assert '10553400' in text.replace(',', ''),(kind,'total value changed')
    assert any('Nanum' in f[3] for f in doc[0].get_fonts()),(kind,'Korean font is not embedded')
    assert 'MUST_NOT_PRINT' not in text,(kind,'hidden/outside print area leaked')
    assert len(doc)==2,(kind,'print area or fitting changed',len(doc))
    assert doc[0].rect.width>doc[0].rect.height and doc[1].rect.width<doc[1].rect.height
    drawings=sum(len(p.get_drawings()) for p in doc);images=sum(len(p.get_images()) for p in doc)
    assert drawings>40,(kind,'chart/table shapes missing',drawings)
    assert images>=1,(kind,'embedded picture missing')
    pages=[]
    for i,p in enumerate(doc):
        p.get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(folder/(kind+'-'+str(i+1)+'.png'))
        pages.append(dict(width=p.rect.width,height=p.rect.height,textCharacters=len(p.get_text()),drawings=len(p.get_drawings()),images=len(p.get_images())))
    annotations=[a.info.get('content') for p in doc for a in p.annots() or []]
    assert 'SOURCE_CELL_COMMENT' in annotations,(kind,'cell comment missing from PDF annotations')
    checks.append(dict(format=kind,pages=pages,headersFooters=True,printAreas=True,hiddenSheetsExcluded=True,microsoftReferenceEquivalence='NOT_VERIFIED',cellCommentPdfPreservation='VERIFIED_AS_PDF_TEXT_ANNOTATION'))
(folder/'OFFICE_CHECK.json').write_text(json.dumps(dict(status='LOCAL_FEASIBILITY_PASS',runtime=version,webIntegration=False,productionSandboxAvailable=False,checks=checks,logs=logs),ensure_ascii=False,indent=2))
print(json.dumps(dict(runtime=version,checks=checks),ensure_ascii=False,indent=2))
