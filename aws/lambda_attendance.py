"""
AWS Lambda function for Veraface attendance sync endpoint.

Deploy this as a Lambda function behind API Gateway.
Required environment variables:
  - ATTENDANCE_TABLE_NAME (DynamoDB table or S3 bucket)

Endpoint: POST /attendance
Headers:  x-api-key: <your-key>
Body:     { "records": [...] }
"""

import json
import boto3
import os
import time
from decimal import Decimal

# ── Config ────────────────────────────────────────────────────────────────────
TABLE_NAME  = os.environ.get('ATTENDANCE_TABLE_NAME', 'veraface_attendance')
S3_BUCKET   = os.environ.get('S3_BUCKET_NAME', 'veraface-attendance-logs')
USE_DYNAMO  = os.environ.get('USE_DYNAMO', 'true').lower() == 'true'

dynamodb = boto3.resource('dynamodb')
s3       = boto3.client('s3')

def lambda_handler(event, context):
    try:
        # Parse body
        body = json.loads(event.get('body', '{}'))
        records = body.get('records', [])

        if not records:
            return response(400, {'error': 'No records provided'})

        if len(records) > 200:
            return response(400, {'error': 'Batch too large (max 200)'})

        # Validate records
        for r in records:
            if not r.get('id') or not r.get('person_id') or not r.get('timestamp'):
                return response(400, {'error': f'Invalid record: {r.get("id", "?")}', 'field': 'id|person_id|timestamp'})

        stored_count = 0

        if USE_DYNAMO:
            stored_count = store_to_dynamodb(records)
        else:
            stored_count = store_to_s3(records)

        return response(200, {
            'status': 'ok',
            'stored': stored_count,
            'timestamp': int(time.time() * 1000),
        })

    except json.JSONDecodeError:
        return response(400, {'error': 'Invalid JSON body'})
    except Exception as e:
        print(f'ERROR: {e}')
        return response(500, {'error': 'Internal server error'})


def store_to_dynamodb(records: list) -> int:
    table = dynamodb.Table(TABLE_NAME)
    count = 0
    with table.batch_writer() as batch:
        for r in records:
            item = {
                'id':          r['id'],
                'person_id':   r['person_id'],
                'timestamp':   r['timestamp'],
                'confidence':  Decimal(str(r.get('confidence', 0))),
                'liveness_ok': r.get('liveness_ok', False),
                'ttl':         int(time.time()) + 30 * 24 * 3600,  # 30-day TTL
            }
            if r.get('location'):
                item['lat'] = Decimal(str(r['location']['lat']))
                item['lon'] = Decimal(str(r['location']['lon']))
            batch.put_item(Item=item)
            count += 1
    return count


def store_to_s3(records: list) -> int:
    key = f"attendance/{int(time.time() * 1000)}.json"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(records),
        ContentType='application/json',
    )
    return len(records)


def response(status_code: int, body: dict) -> dict:
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body),
    }
