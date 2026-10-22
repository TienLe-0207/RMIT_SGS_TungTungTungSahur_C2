# Chạy SealedExam + TideCloak local (Windows)

Hướng dẫn này dùng khi chạy lại từ đầu, ví dụ khi chuyển sang máy khác vì máy cũ hết RAM.

## 0. Yêu cầu máy

| Thứ | Ghi chú |
|---|---|
| RAM | Tối thiểu 8 GB, nên dùng 16 GB. TideCloak chiếm khoảng 1–1.5 GB trong Docker. |
| Docker Desktop | Đang chạy (`docker info` không báo lỗi). Settings → Resources: cho VM ít nhất 4 GB. |
| Git for Windows | Cần **Git Bash**. Mọi lệnh bên dưới chạy trong Git Bash, không chạy trong PowerShell. |
| Node.js | v20 trở lên (máy gốc dùng v24). |
| jq 1.7+ | Xem bước 1. |
| Chrome | Một profile cho mỗi persona (6 profile). |

Nếu máy yếu, tắt bớt container không dùng: `docker ps`, rồi `docker stop <tên>`.

## 1. Cài jq (chỉ làm một lần)

```bash
mkdir -p ~/bin
curl -fsSL -o ~/bin/jq.exe https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe
jq --version   # jq-1.7.1
```
Nếu `jq` không tìm thấy, mở lại Git Bash (`~/bin` có sẵn trong PATH của Git Bash).

## 2. Lấy code

Code phải được commit và push từ máy cũ trước (nhánh `feat/ui`).

```bash
git clone https://github.com/TienLe-0207/RMIT_SGS_TungTungTungSahur_C2.git
cd RMIT_SGS_TungTungTungSahur_C2
git checkout feat/ui
npm install
```

## 3. Tạo `.env`

```bash
cp .env.example .env
```
Mở `.env` và điền:
```
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=<tự đặt một mật khẩu mạnh, KHÔNG commit>
TIDE_LICENSE_EMAIL=tenb6988@gmail.com
TIDE_TERMS_ACCEPTED=yes        # chỉ điền yes khi chủ dự án đã đọc và đồng ý https://tide.org/legal
```
`.env` đã nằm trong `.gitignore`.

## 4. Dựng TideCloak + realm

```bash
bash scripts/init-tidecloak.sh 2>&1 | tee data/init.log
```
(Hoặc `npm run init`.) Script sẽ:
1. Xoá container `tidecloak` cũ và DB trong `data/keycloakdb*`. **Mỗi lần chạy lại là reset toàn bộ realm**, nên phải link lại tài khoản cho cả 6 persona.
2. Chạy `tideorg/tidecloak-dev:latest` ở `http://localhost:8080`. Lần đầu sẽ tải image khoảng vài trăm MB.
3. Tạo realm `sealedexam`, bật licence và IGA, tạo 6 user: `minh hoa tuan linh nam quang`.
4. In ra **6 link mời** (cũng lưu ở `data/invite-links.txt`, hạn 12 giờ), rồi **đứng chờ**. Đừng đóng terminal.

## 5. Link tài khoản Tide cho 6 persona

Tạo 6 Chrome profile: `minh, hoa, tuan, linh, nam, quang`. Cửa sổ ẩn danh không dùng thay được, vì chúng chung một phiên đăng nhập.

Với mỗi persona: mở **đúng profile** đó, dán link của persona đó, rồi tạo tài khoản Tide (username + mật khẩu, không cần email). **Ghi lại username và mật khẩu.**

Terminal sẽ báo `<user> linked.` cho từng người. Khi đủ 6, script tự:
- gán role: linh → `exam-setter` + `_tide_encryptor`, nam → `proctor`, quang → `it-operator`
- cấp `tide-realm-admin` cho council `minh, hoa, tuan` (chuyển realm sang multiAdmin)
- xuất `data/tidecloak.json` và in ra `Init complete!`

Kiểm tra:
```bash
jq 'has("jwk") and has("vendorId") and has("homeOrkUrl")' data/tidecloak.json   # phải ra true
```

## 6. Chạy app

```bash
npm run dev
```
Trong từng Chrome profile, mở http://localhost:3000 và bấm **Sign in with Tide**.
Khi một persona vừa được cấp hoặc bị thu role, persona đó phải **Sign out rồi Sign in lại** thì role mới mới có hiệu lực.

## Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `Port 8080 is already in use` / container không lên | `docker rm -f tidecloak`, tắt app khác đang dùng cổng 8080, rồi chạy lại bước 4. |
| `TideCloak did not start within 120 seconds` | Thường do thiếu RAM. Xem `docker logs tidecloak`, tắt bớt container hoặc ứng dụng, tăng RAM cho Docker, chạy lại. |
| `STOP: the Tide realm was NOT set up` (exit 2) | `.env` thiếu `TIDE_LICENSE_EMAIL` hoặc `TIDE_TERMS_ACCEPTED=yes`. |
| `TIDE-IDPEXT-VENDOR-STRIPE_CHECKOUT_FAILED` sau khoảng 100 giây | Tên lỗi gây hiểu nhầm. Lỗi thật ở `docker logs tidecloak \| grep Midgard`: `InitializeWallet ... Timeout of 100 seconds`, tức mạng Tide/licence không trả lời. Kiểm tra ORK: `curl -sI https://ork1.tideprotocol.com`. Nếu ORK vẫn trả 200, đợi một lúc rồi chạy lại bước 4. Nếu lỗi kéo dài, báo team Tide (Discord https://discord.gg/XBMd9ny2q5 hoặc info@tide.org) kèm đoạn log Midgard. |
| `setUpTideRealm ... NEED_PAYMENT / 303` | Licence không cấp được. Kiểm tra email licence và kết nối internet. |
| Link mời hết hạn | Chạy lại bước 4 (reset realm), hoặc nhờ agent tạo link mới. |
| `jwk` trong `tidecloak.json` = false | Licence hoặc IGA chưa xong. Chạy lại bước 4. |
| Lỗi DPoP / CORS / bị đẩy về trang login | Nhờ agent chạy `tide_doctor` (Tide MCP). |
| Script lỗi lạ, ID có ký tự `\r` | jq cũ hơn 1.7. Cài lại jq 1.7.1 (bước 1). |

Reset dữ liệu demo của app (không đụng tới realm): `npm run reset`.
