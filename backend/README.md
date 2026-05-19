```
npm install
npm run deploy
```

#### 2回目以降のデプロイ

> **重要**: 毎デプロイ前に Secrets Manager の最新トークンを SST Secret に同期してください。詳細は [デプロイ前のトークン同期（必須）](#デプロイ前のトークン同期必須) を参照。

```bash
# 1. Secrets Manager → SST Secret の同期（必須）
TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id generosity-incident-management-production-origin-verify-token \
  --query SecretString --output text --region ap-northeast-1 | jq -r .current)

cd sst
npx sst secret set OriginVerifyToken "$TOKEN" --stage staging

# 2. デプロイ
npm run deploy:staging
```