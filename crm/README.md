# CRM Lead Generation Database

This directory contains lead generation data for outreach campaigns.

## Files

- `people.csv` - Main database of PMM (Product Marketing Manager) leads

## CSV Schema

| Field | Description |
|-------|-------------|
| `first_name` | Contact's first name |
| `last_name` | Contact's last name |
| `title` | Job title (targeting PMM roles) |
| `company` | Company name |
| `linkedin_url` | LinkedIn profile URL |
| `email` | Email address (if available) |
| `location` | Geographic location |
| `source` | How the lead was found |
| `date_added` | Date the lead was added (YYYY-MM-DD) |
| `status` | Lead status: `new`, `contacted`, `responded`, `converted`, `not_interested` |
| `notes` | Additional notes about the lead |

## Usage

Provide a company name and Claude will search for PMM contacts and add them to the database.
