#!/usr/bin/env python3
"""
Daily Accrual Script
Updates daily accruals for all active investments in the database.
Can be run manually or scheduled via cron.
"""

import sqlite3
import sys
import os
from datetime import datetime, timedelta

def accrue_investments(db_path='db.sqlite'):
    """Process daily accruals for all active investments."""
    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get all active investments that haven't matured
        today = datetime.now().date().isoformat()
        cursor.execute("""
            SELECT i.id, i.user_id, i.deposit_amount, i.total_accruals, 
                   p.daily_rate, i.maturity_date
            FROM investments i
            JOIN packages p ON i.package_id = p.id
            WHERE i.status = 'active' AND i.maturity_date > ?
        """, (today,))

        investments = cursor.fetchall()
        print(f"Processing {len(investments)} active investments...")

        for investment in investments:
            inv_id, user_id, deposit_amount, total_accruals, daily_rate, maturity_date = investment
            
            # Calculate daily accrual
            daily_accrual = deposit_amount * daily_rate
            
            # Update total accruals
            new_total = total_accruals + daily_accrual
            cursor.execute("""
                UPDATE investments 
                SET total_accruals = ? 
                WHERE id = ?
            """, (new_total, inv_id))

            # Create accrual transaction
            cursor.execute("""
                INSERT INTO transactions (user_id, type, amount, investment_id, date)
                VALUES (?, 'accrual', ?, ?, datetime('now'))
            """, (user_id, daily_accrual, inv_id))

            print(f"Investment #{inv_id}: Added K{daily_accrual:.2f} (Total: K{new_total:.2f})")

            # Check if matured today
            if maturity_date == today:
                cursor.execute("""
                    UPDATE investments 
                    SET status = 'matured' 
                    WHERE id = ?
                """, (inv_id,))
                print(f"Investment #{inv_id}: Matured")

        conn.commit()
        conn.close()
        print("Accrual processing complete!")
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Process daily investment accruals')
    parser.add_argument('--db', default='db.sqlite', help='Path to SQLite database file')
    args = parser.parse_args()
    
    accrue_investments(args.db)

