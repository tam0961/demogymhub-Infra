# Cau noi may cham cong Face ID cho DemoGym

Chay tren may tinh luon bat o quay, cung mang voi may cham cong. Doc luot quet. Chi them nguoi va anh mat len may khi le tan bam 'Gui khuon mat len may' (can khach dong y). Khong xoa nguoi, khong xoa lich su, khong doi cau hinh may. Tai khoan may cua cau noi can quyen them nguoi neu muon dang ky mat; chi can xem thi chi doc duoc.

1. Cai Node.js LTS (18 tro len).
2. DemoGym: Thiet lap > Thiet bi > them may, chep khoa (device key).
3. Copy `config.example.json` thanh `config.json`, dien `server`, `ip`, `user`, `pass`, `key`. Dung tai khoan RIENG chi xem tren may, khong dung chung voi NextX.
4. Bam `thu-ket-noi.bat`: phai thay "KET NOI TOT".
5. Bam `chay-cau-noi.bat`. Muon tu chay khi mo may: dat loi tat vao `shell:startup`.

- Mat khau sai: cau noi tu tam dung 10 phut de may khong khoa tai khoan.
- Khong dua `config.json` vao git (da nam trong .gitignore).
- Ma nguoi tren may phai la Face ID, ma hoi vien (vi du HV0389) hoac so dien thoai trong DemoGym; nhan vien thi gan "Ma cham cong" o Nhan su > Nhan vien.
- Khach quet: popup hien tren man hinh le tan (anh, goi, han, cong no) va le tan bam Check-in.

## Keo anh khuon mat tu may ve DemoGym (chi sao chep)
Bam `keo-anh.bat` (hoac `node bridge.js pull`). Chi DOC tu may. DemoGym chi them anh cho hoi vien KHONG co anh, khong ghi de anh co san, khong sua thong tin hoi vien. Ket qua: saved (da them), has_photo (da co anh, bo qua), no_match (ma khong khop hoi vien), other_branch, no_photo, bad_image.

## Chay thanh 2 tien trinh rieng (khuyen dung)
- `chay-quet.bat`: chi nhan luot quet cua khach, popup luon nhanh.
- `chay-dang-ky.bat`: chi nhan viec dang ky khuon mat tu DemoGym va ghi len may. Viec nay hoi DemoGym, chi goi may khi co viec.
- `chay-cau-noi.bat` van chay ca hai trong mot tien trinh.
Dang ky hoac keo anh (`keo-anh.bat`) lau hoac loi cung khong lam cham phan quet.

## Xem truc tiep camera may cham cong (de chup anh khuon mat)
Chay trong `chay-dang-ky.bat` (hoac `chay-cau-noi.bat`), mo cong 8898 chi tren may tinh nay (127.0.0.1). Trinh duyet phai mo tren CHINH may tinh dang chay cau noi, dung Chrome hoac Edge, va trang phai la HTTPS hoac http://localhost (WebCodecs chi chay o ngu canh an toan). `allowOrigins` trong config liet ke them dia chi trang duoc phep ket noi (mac dinh chi dia chi `server`). Camera chi de XEM cho dung khung, khong luu hinh.

## May tinh le tan (cai mot lan)
1. Cai Node.js LTS (nodejs.org).
2. Chep ca thu muc `face-bridge` (da co `config.json`) sang may le tan, vi du `C:\face-bridge`. `config.json` chua mat khau may cham cong: chep bang USB hoac thu muc noi bo, khong gui qua chat/email.
3. Bam doi `cai-may-letan.bat`: tao 2 loi tat o thu muc Startup (tu chay khi mo may), chay thu va mo trang DemoGym.
4. Le tan dung Chrome hoac Edge, mo DemoGym bang **ten mien HTTPS** (Dev: https://dev.thgymhub.online, Prod: https://thgymhub.online), khong dung dia chi IP. Xem camera may cham cong can trang HTTPS va cau noi dang chay tren CHINH may nay. Neu trinh duyet hoi quyen truy cap thiet bi trong mang noi bo, chon Cho phep.
5. Neu may khac cung dang chay cau noi, TAT cau noi o do (chi mot may hoi may cham cong).
Khi chuyen sang Prod: doi `server` trong config.json thanh https://thgymhub.online, tao thiet bi o Prod va dung khoa cua thiet bi do.
