# CA証明書に対する秘密キーファイルca.key.pemを作成します。

```
openssl genrsa -out ca.key.pem 2048
chmod 400 ca.key.pem
```

# 証明書リクエスト ca.csrを作成します。

```
openssl req -new -key ca.key.pem -out ca.csr
```

# CA証明書を作成

```
openssl x509 -req -days 7300 -in ca.csr -signkey ca.key.pem -out ca.crt.pem
openssl x509 -text -in ca.crt.pem -noout
```

---

# サーバー証明書に対する秘密キーを作成します。

```
openssl genrsa -out server.key.pem 2048
```

# 証明書リクエストserver.csrを作成します。

```
openssl req -new -key server.key.pem -out server.csr -subj "/C=JP/ST=Tokyo/L=MinatoCity/O=TeX2e/CN=localhost"
```

# SAN作成

cat <<'EOS' > san.txt subjectAltName = DNS:localhost, IP:127.0.0.1 EOS

# サーバ証明書

```
openssl x509 -req -days 7300 -CAcreateserial \
  -in server.csr -CA ca.crt.pem -CAkey ca.key.pem \
  -extfile san.txt \
  -out server.crt.pem
openssl x509 -text -in server.crt.pem -noout
```
