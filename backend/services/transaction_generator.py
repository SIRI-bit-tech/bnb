import random
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from decimal import Decimal
from data.names_database import (
    AMERICAN_MALE_FIRST_NAMES,
    AMERICAN_FEMALE_FIRST_NAMES,
    AMERICAN_LAST_NAMES,
    LOW_AMOUNT_MERCHANTS,
    MEDIUM_AMOUNT_MERCHANTS,
    HIGH_AMOUNT_MERCHANTS,
    P2P_DESCRIPTIONS,
    LOW_INCOME_DESCRIPTIONS,
    HIGH_INCOME_DESCRIPTIONS
)

# Bills and utilities for debits
BILLS_PAYMENTS = [
    "AT&T Bill Payment", "Verizon Wireless Bill", "T-Mobile Bill", "Comcast Xfinity Bill",
    "Spectrum Internet Bill", "Con Edison Electric Bill", "PG&E Gas & Electric",
    "Duke Energy Bill", "Southern California Edison Bill", "Cox Communications Bill",
    "CenturyLink Bill", "Frontier Communications Bill"
]

# Loan payments for debits
LOAN_PAYMENTS = [
    "Auto Loan Payment", "Mortgage Payment", "Personal Loan Payment", 
    "Business Loan Payment", "Student Loan Payment", "Home Equity Loan Payment"
]

# Check deposits for credits
CHECK_DEPOSITS = [
    "Payroll Check Deposit", "Tax Refund Check", "Insurance Claim Check",
    "Dividend Check Deposit", "Settlement Check", "Refund Check Deposit",
    "Rebate Check", "Gift Check Deposit", "Inheritance Check"
]


class TransactionGenerator:
    """Generate realistic transaction history with high amounts"""
    
    # Fast food merchants for limiting
    FAST_FOOD_MERCHANTS = [
        "McDonald's", "Starbucks", "Subway", "Taco Bell", "Wendy's", 
        "Burger King", "Dunkin'", "Chipotle Mexican Grill"
    ]
    
    def __init__(self, user_name: str = "User"):
        self.user_name = user_name  # Store user's name for internal transfers
        self.used_names = set()  # Track used names to ensure uniqueness
        self.fast_food_count = 0  # Track fast food transactions
        self.max_fast_food = 3  # Maximum fast food transactions per generation
    
    def get_unique_person_name(self) -> str:
        """Generate a unique person name (no duplicates)"""
        max_attempts = 1000
        for _ in range(max_attempts):
            # Randomly choose male or female first name
            if random.choice([True, False]):
                first_name = random.choice(AMERICAN_MALE_FIRST_NAMES)
            else:
                first_name = random.choice(AMERICAN_FEMALE_FIRST_NAMES)
            
            last_name = random.choice(AMERICAN_LAST_NAMES)
            full_name = f"{first_name} {last_name}"
            
            if full_name not in self.used_names:
                self.used_names.add(full_name)
                return full_name
        
        # Fallback: add middle initial if we somehow run out
        first_name = random.choice(AMERICAN_MALE_FIRST_NAMES + AMERICAN_FEMALE_FIRST_NAMES)
        middle_initial = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        last_name = random.choice(AMERICAN_LAST_NAMES)
        full_name = f"{first_name} {middle_initial}. {last_name}"
        self.used_names.add(full_name)
        return full_name
    
    def get_merchant_with_amount(self, target_amount: Decimal) -> Tuple[str, Decimal]:
        """
        Get a merchant name appropriate for the target amount
        Returns: (merchant_name, realistic_amount)
        """
        amount_float = float(target_amount)
        
        # Categorize by amount and select appropriate merchant
        if amount_float < 200:
            # Low amount: fast food (limited), subscriptions, gas
            # Check if we've hit fast food limit
            available_merchants = [m for m in LOW_AMOUNT_MERCHANTS if m not in self.FAST_FOOD_MERCHANTS]
            
            # 20% chance of fast food if under limit, otherwise non-food
            if self.fast_food_count < self.max_fast_food and random.random() < 0.2:
                merchant = random.choice(self.FAST_FOOD_MERCHANTS)
                self.fast_food_count += 1
            else:
                merchant = random.choice(available_merchants)
            
            # Generate realistic amount for this category
            amount = Decimal(str(round(random.uniform(5, 200), 2)))
        elif amount_float < 2000:
            # Medium amount: groceries, utilities, casual dining
            merchant = random.choice(MEDIUM_AMOUNT_MERCHANTS)
            amount = Decimal(str(round(random.uniform(200, 2000), 2)))
        else:
            # High amount: professional equipment, industrial supplies
            merchant = random.choice(HIGH_AMOUNT_MERCHANTS)
            amount = Decimal(str(round(random.uniform(2000, min(50000, amount_float * 1.2)), 2)))
        
        return merchant, amount
    
    def get_merchant_name(self) -> str:
        """Get a random merchant name (deprecated - use get_merchant_with_amount)"""
        # Randomly select from all categories
        all_merchants = LOW_AMOUNT_MERCHANTS + MEDIUM_AMOUNT_MERCHANTS + HIGH_AMOUNT_MERCHANTS
        return random.choice(all_merchants)
    
    def generate_high_amount(self, min_amount: float = 100, max_amount: float = 50000) -> Decimal:
        """
        Generate realistic high transaction amounts
        Distribution: Mix of small, medium, and large amounts
        - 30% small: $100-$1,000
        - 40% medium: $1,000-$10,000
        - 30% large: $10,000-$50,000
        """
        rand = random.random()
        
        if rand < 0.3:  # 30% small amounts
            amount = random.uniform(100, 1000)
        elif rand < 0.7:  # 40% medium amounts
            amount = random.uniform(1000, 10000)
        else:  # 30% large amounts
            amount = random.uniform(10000, max_amount)
        
        # Round to 2 decimal places
        return Decimal(str(round(amount, 2)))
    
    def distribute_timestamps(
        self,
        start_date: datetime,
        end_date: datetime,
        count: int
    ) -> List[datetime]:
        """
        Distribute timestamps realistically across banking hours with guaranteed 18+ minute gaps.
        """
        if count == 0:
            return []
        if count == 1:
            return [end_date]

        # Ensure effective start date is sufficiently stretched back
        hours_needed = max(12.0, count * 1.5)
        effective_start = end_date - timedelta(hours=hours_needed)
        if start_date < effective_start:
            effective_start = start_date

        total_seconds = (end_date - effective_start).total_seconds()
        interval = total_seconds / count

        timestamps = []
        for i in range(count):
            base = effective_start + timedelta(seconds=i * interval)
            jitter = random.uniform(300, min(1800, max(300, interval * 0.3)))
            ts = base + timedelta(seconds=jitter)

            # Restrict to realistic banking hours (08:30 AM - 05:45 PM)
            if ts.hour < 8:
                ts = ts.replace(hour=8, minute=random.randint(30, 55))
            elif ts.hour >= 18:
                ts = ts.replace(hour=17, minute=random.randint(10, 45))

            timestamps.append(ts)

        timestamps.sort()

        # Enforce strict 18-45 minute gap between consecutive transactions
        for i in range(1, len(timestamps)):
            gap = (timestamps[i] - timestamps[i - 1]).total_seconds()
            if gap < 1080:  # less than 18 minutes
                timestamps[i] = timestamps[i - 1] + timedelta(minutes=random.randint(18, 45))

        # If the last timestamp exceeds end_date, adjust the ENTIRE sequence backwards relative to end_date
        if timestamps[-1] > end_date:
            diff = timestamps[-1] - end_date + timedelta(minutes=5)
            timestamps = [t - diff for t in timestamps]

        # Final pass: Ensure banking hours and minimum gap
        for i in range(1, len(timestamps)):
            if (timestamps[i] - timestamps[i - 1]).total_seconds() < 1080:
                timestamps[i] = timestamps[i - 1] + timedelta(minutes=random.randint(18, 45))

        timestamps.sort()
        return timestamps
    
    def validate_generation_params(
        self,
        start_date: datetime,
        end_date: datetime,
        starting_balance: Decimal,
        closing_balance: Decimal,
        transaction_count: int
    ) -> Tuple[bool, str]:
        """Validate transaction generation parameters"""
        
        # Date validation
        if end_date < start_date:
            return False, "End date must be after start date"
        
        # Balance validation
        if starting_balance < 0:
            return False, "Starting balance cannot be negative"
        
        if closing_balance < 0:
            return False, "Closing balance cannot be negative"
        
        # Transaction count validation
        if transaction_count < 1:
            return False, "Must generate at least 1 transaction"
        
        if transaction_count > 1000:
            return False, "Cannot generate more than 1000 transactions at once"
        
        # Check if balance change is achievable
        balance_difference = abs(closing_balance - starting_balance)
        avg_per_transaction = float(balance_difference) / transaction_count
        
        if avg_per_transaction < 5:
            return False, f"Average transaction amount (${avg_per_transaction:.2f}) is too small. Increase balance difference or reduce transaction count."
        
        if avg_per_transaction > 100000:
            return False, f"Average transaction amount (${avg_per_transaction:.2f}) is too large. This may look suspicious."
        
        return True, "Validation passed"
    
    def get_description_for_amount(self, amount: Decimal, is_credit: bool) -> str:
        """
        Select a realistic description guaranteed to fit the given dollar amount.
        """
        val = float(amount)
        
        if is_credit:
            if val <= 500:
                # Small refunds, rewards, P2P
                return random.choice([
                    "Cashback Reward",
                    "Refund Check Deposit",
                    "Rebate Check Deposit",
                    f"Zelle from {self.get_unique_person_name()}",
                    f"Venmo from {self.get_unique_person_name()}"
                ])
            elif val <= 5000:
                # Medium deposits, paycheck, P2P
                return random.choice([
                    "Payroll Check Deposit",
                    "Tax Refund Check",
                    "Dividend Check Deposit",
                    "Insurance Claim Check",
                    f"Transfer from {self.get_unique_person_name()}",
                    f"Wire transfer from {self.get_unique_person_name()}"
                ])
            elif val <= 50000:
                # High income, business, consulting
                return random.choice([
                    "Payroll Direct Deposit",
                    "Consulting Fee Deposit",
                    "Contract Payment",
                    "Investment Return Deposit",
                    "Stock Dividend Payment",
                    "Business Income Deposit",
                    f"Wire transfer from {self.get_unique_person_name()}"
                ])
            else:
                # High-value credits ($50,000+)
                return random.choice([
                    "Corporate Incoming Wire Transfer",
                    "Investment Liquidation Proceeds",
                    "Property Sale Escrow Proceeds",
                    "Treasury Direct Credit",
                    "Commercial Settlement Deposit",
                    "Institutional Wire Transfer"
                ])
        else:
            # Debits
            if val <= 150:
                # Micro purchases, fast food, gas, streaming
                merchants = [m for m in LOW_AMOUNT_MERCHANTS if m not in self.FAST_FOOD_MERCHANTS]
                if self.fast_food_count < self.max_fast_food and random.random() < 0.3:
                    merchant = random.choice(self.FAST_FOOD_MERCHANTS)
                    self.fast_food_count += 1
                else:
                    merchant = random.choice(merchants)
                return f"{merchant} Purchase"
            elif val <= 650:
                # Utility & internet bills, groceries, small retail
                if random.random() < 0.6:
                    return random.choice(BILLS_PAYMENTS)
                else:
                    merchant = random.choice(MEDIUM_AMOUNT_MERCHANTS)
                    return f"{merchant} Purchase"
            elif val <= 4000:
                # Loan payments, rent, electronics, P2P
                if random.random() < 0.5:
                    return random.choice(LOAN_PAYMENTS)
                elif random.random() < 0.8:
                    merchant = random.choice(["Best Buy", "Apple Store", "Home Depot Pro", "Staples Commercial"])
                    return f"{merchant} Purchase"
                else:
                    return f"Wire transfer to {self.get_unique_person_name()}"
            elif val <= 40000:
                # Industrial & Engineering equipment, supplier purchases, large vendor payables
                if random.random() < 0.8:
                    merchant = random.choice(HIGH_AMOUNT_MERCHANTS)
                    return f"{merchant} Purchase"
                else:
                    return f"Commercial Wire Transfer to {self.get_unique_person_name()}"
            else:
                # Major debits ($40,000+) - Real corporate vendors, heavy machinery & enterprise wires
                if random.random() < 0.6:
                    merchant = random.choice([
                        "Caterpillar Inc.", "John Deere", "General Electric", "Siemens Industry", 
                        "W.W. Grainger", "Dell Technologies", "WESCO Distribution", "Cummins Inc.",
                        "Eaton Corporation", "Rockwell Automation"
                    ])
                    return f"{merchant} Purchase"
                else:
                    return random.choice([
                        "Corporate Outgoing Wire Transfer",
                        "Commercial Equipment Purchase",
                        "Real Estate Escrow Transfer",
                        "Treasury Settlement Payment",
                        "Institutional Vendor Transfer",
                        "Inter-Bank Clearing Wire"
                    ])

    def generate_transactions(
        self,
        start_date: datetime,
        end_date: datetime,
        starting_balance: Decimal,
        closing_balance: Decimal,
        transaction_count: int,
        account_id: str,
        currency: str = "USD",
        user_name: str = "User"
    ) -> List[Dict]:
        """
        Generate realistic transactions with target balance tracking and strict category caps.
        """
        # Validate parameters
        is_valid, message = self.validate_generation_params(
            start_date, end_date, starting_balance, closing_balance, transaction_count
        )
        if not is_valid:
            raise ValueError(message)
        
        # Calculate overall target change
        total_target_change = closing_balance - starting_balance
        
        # Generate timestamps
        timestamps = self.distribute_timestamps(start_date, end_date, transaction_count)
        
        # Reset counters
        self.fast_food_count = 0
        
        transactions = []
        current_balance = starting_balance
        
        for i, timestamp in enumerate(timestamps):
            is_last = (i == transaction_count - 1)
            steps_left = transaction_count - i
            remaining_change_needed = closing_balance - current_balance
            
            if is_last:
                # Force last transaction amount to hit closing balance exactly
                is_credit = (remaining_change_needed > 0)
                amount = abs(remaining_change_needed)
            else:
                # Determine probability of credit vs debit based on remaining balance goal
                avg_step_needed = float(remaining_change_needed) / steps_left
                
                if remaining_change_needed > 0:
                    credit_prob = 0.75 if avg_step_needed > 10000 else 0.60
                elif remaining_change_needed < 0:
                    credit_prob = 0.25 if avg_step_needed < -10000 else 0.40
                else:
                    credit_prob = 0.50
                
                is_credit = (random.random() < credit_prob)
                
                # Calculate scale of account
                balance_scale = max(float(starting_balance), float(closing_balance), 1000.0)
                
                # Pick a proportion of average needed amount, bounded by balance scale
                if is_credit == (remaining_change_needed > 0):
                    # Moving towards target
                    target_mag = abs(avg_step_needed)
                    variation = random.uniform(0.4, 1.4)
                    amount_val = max(15.0, target_mag * variation)
                else:
                    # Counter-trend transaction (makes history look organic)
                    amount_val = random.uniform(50.0, min(balance_scale * 0.1, 15000.0))
                
                # Cap non-last step amounts to avoid huge spikes before the end
                max_step_amount = max(balance_scale * 0.3, 20000.0)
                amount_val = min(amount_val, max_step_amount)
                amount = Decimal(str(round(amount_val, 2)))
            
            # Select realistic description matching the exact amount and type
            description = self.get_description_for_amount(amount, is_credit)
            
            # Update balance
            if is_credit:
                transaction_type = "credit"
                current_balance += amount
            else:
                transaction_type = "debit"
                current_balance -= amount
            
            # Create transaction record
            transaction = {
                "account_id": account_id,
                "type": transaction_type,
                "amount": float(amount),
                "currency": currency,
                "description": description,
                "status": "completed",
                "created_at": timestamp.isoformat(),
                "posted_date": timestamp.isoformat(),
                "balance_before": float(current_balance - (amount if is_credit else -amount)),
                "balance_after": float(current_balance),
                "reference_number": f"TXN{int(timestamp.timestamp())}{random.randint(1000, 9999)}"
            }
            
            transactions.append(transaction)
        
        return transactions
    
    def generate_preview(
        self,
        start_date: datetime,
        end_date: datetime,
        starting_balance: Decimal,
        closing_balance: Decimal,
        transaction_count: int,
        preview_count: int = 10
    ) -> Dict:
        """
        Generate a preview of transactions without saving to database
        
        Returns:
        - sample_transactions: List of preview transactions
        - summary: Statistics about the generation
        """
        
        # Generate full transaction list
        transactions = self.generate_transactions(
            start_date=start_date,
            end_date=end_date,
            starting_balance=starting_balance,
            closing_balance=closing_balance,
            transaction_count=transaction_count,
            account_id="preview",  # Dummy account ID for preview
            currency="USD"
        )
        
        # Calculate summary statistics
        total_debits = sum(t["amount"] for t in transactions if t["type"] == "debit")
        total_credits = sum(t["amount"] for t in transactions if t["type"] == "credit")
        debit_count = sum(1 for t in transactions if t["type"] == "debit")
        credit_count = sum(1 for t in transactions if t["type"] == "credit")
        
        # Get sample transactions (evenly distributed)
        sample_size = min(preview_count, len(transactions))
        if sample_size == len(transactions):
            sample_transactions = transactions
        else:
            step = len(transactions) // sample_size
            sample_transactions = [transactions[i * step] for i in range(sample_size)]
        
        # Add running balance to preview
        running_balance = starting_balance
        for txn in sample_transactions:
            if txn["type"] == "credit":
                running_balance += Decimal(str(txn["amount"]))
            else:
                running_balance -= Decimal(str(txn["amount"]))
            txn["running_balance"] = float(running_balance)
        
        return {
            "sample_transactions": sample_transactions,
            "summary": {
                "total_transactions": transaction_count,
                "debit_count": debit_count,
                "credit_count": credit_count,
                "total_debits": float(total_debits),
                "total_credits": float(total_credits),
                "starting_balance": float(starting_balance),
                "closing_balance": float(closing_balance),
                "net_change": float(closing_balance - starting_balance)
            }
        }
