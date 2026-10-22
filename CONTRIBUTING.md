# Quy ước làm việc

## Nhánh và pull request

- Không commit thẳng vào `main`.
- Mỗi việc một nhánh, đặt tên `<tên>/<việc>`: `uyen/logistic-regression`, `tien/random-forest`.
- Mở pull request, người còn lại review rồi mới merge.

## Commit message (tiếng Anh)

Dạng `<type>: <mô tả ngắn, động từ nguyên mẫu, không chấm câu cuối>`

| Type | Dùng khi | Ví dụ |
|---|---|---|
| `feat` | Thêm chức năng, mô hình | `feat: add Gaussian Naive Bayes classifier` |
| `fix` | Sửa lỗi | `fix: handle zero division in macro F1` |
| `exp` | Thí nghiệm, kết quả, biểu đồ | `exp: add learning rate sweep for MLP` |
| `test` | Thêm/sửa test | `test: compare random forest against scikit-learn` |
| `docs` | README, báo cáo, slide | `docs: fill in MNIST results table` |
| `refactor` | Sửa code không đổi hành vi | `refactor: vectorize split search in decision tree` |
| `chore` | Cấu hình, dọn dẹp | `chore: pin dependency versions` |

Mỗi commit một thay đổi trọn vẹn; tránh `update`, `fix bug`, `final`.

## Trước khi commit

```bash
ruff format .      # định dạng code
ruff check .       # kiểm tra lỗi và thứ tự import
pytest             # chạy test
```

## Không commit

- Dữ liệu tải về (`data/`) và trọng số mô hình (`*.pt`, `*.npz`): đã có trong `.gitignore`.
- Notebook chạy dở: chạy lại sạch từ đầu (Restart & Run All) trước khi commit.

## README hai ngôn ngữ

`README.md` (tiếng Anh) và `README.vi.md` (tiếng Việt) phải giống nhau về nội dung.
Sửa bản nào thì sửa luôn bản kia trong cùng một commit.
