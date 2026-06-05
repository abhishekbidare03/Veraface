# AWS Infrastructure Setup Guide

## Prerequisites
- AWS CLI configured: `aws configure`
- Python 3.9+ for Lambda
- IAM user with Lambda + API Gateway + DynamoDB permissions

## Step 1: Create DynamoDB Table

```bash
aws dynamodb create-table \
  --table-name veraface_attendance \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Enable TTL for automatic 30-day cleanup
aws dynamodb update-time-to-live \
  --table-name veraface_attendance \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  --region ap-south-1
```

## Step 2: Deploy Lambda Function

```bash
# Package the Lambda
cd aws/
zip lambda.zip lambda_attendance.py

# Create Lambda function
aws lambda create-function \
  --function-name veraface-attendance-sync \
  --runtime python3.11 \
  --handler lambda_attendance.lambda_handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/veraface-lambda-role \
  --zip-file fileb://lambda.zip \
  --environment Variables='{ATTENDANCE_TABLE_NAME=veraface_attendance,USE_DYNAMO=true}' \
  --region ap-south-1

# Update if already exists
aws lambda update-function-code \
  --function-name veraface-attendance-sync \
  --zip-file fileb://lambda.zip \
  --region ap-south-1
```

## Step 3: Create API Gateway

```bash
# Create REST API
aws apigateway create-rest-api \
  --name veraface-api \
  --region ap-south-1

# Note the returned id (e.g. abc123xyz) — use it in subsequent commands
API_ID=abc123xyz

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID \
  --query 'items[0].id' --output text --region ap-south-1)

# Create /attendance resource
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part attendance \
  --region ap-south-1

# Create POST method
# ... (full setup via AWS Console is easier)
```

## Step 4: Create API Key

```bash
aws apigateway create-api-key \
  --name veraface-device-key \
  --enabled \
  --region ap-south-1

# Save the returned 'value' as AWS_API_KEY in SyncService.ts
```

## Step 5: Update SyncService.ts

```typescript
// src/services/SyncService.ts
const AWS_ENDPOINT = 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/attendance';
const AWS_API_KEY  = 'YOUR_KEY_VALUE_FROM_STEP_4';
```

## IAM Role Policy

Create a role `veraface-lambda-role` with this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:*:table/veraface_attendance"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "*"
    }
  ]
}
```
