# Filter oversized Timepix downloads into documented subsets (no value changes).
import sys,csv,os
src_dir=sys.argv[1]
files=[os.path.join(src_dir,f'tpx_{y}.csv') for y in (2012,2014,2016,2018,2020,2022,2024)]
out_daily=open(os.path.join(src_dir,'subset_timepix_ISS_REM_daily_2014-2025.csv'),'w',newline='')
out_lid=open(os.path.join(src_dir,'subset_timepix_ISS_REM-Lid_Columbus_selected_days.csv'),'w',newline='')
out_bpd=open(os.path.join(src_dir,'subset_timepix_BioSentinel_BPD_2024-05-01_to_2024-05-20.csv'),'w',newline='')
out_hera=open(os.path.join(src_dir,'subset_timepix_ArtemisI_HERA_full.csv'),'w',newline='')
lid_days={'2021-10-27','2021-10-28','2021-10-29','2021-10-30','2022-01-10','2022-01-11','2022-01-12'}
W={}
hdr=None
for f in files:
    with open(f,newline='') as fh:
        r=csv.reader(fh); h=next(r)
        if hdr is None:
            hdr=h
            for o in (out_daily,out_lid,out_bpd,out_hera):
                w=csv.writer(o); w.writerow(h); W[o]=w
        assert h==hdr,(f,h)
        for row in r:
            iid=row[1]; ts=row[0]
            if iid.endswith('-pre'): W[out_daily].writerow(row)
            elif iid=='REM-Lid' and ts[:10] in lid_days: W[out_lid].writerow(row)
            elif iid=='BPD' and '2024-05-01'<=ts[:10]<='2024-05-20': W[out_bpd].writerow(row)
            elif 'HERA' in iid: W[out_hera].writerow(row)
for o in W: o.close()
