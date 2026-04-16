from .models import RedditUser, ScrapeError
from sqlalchemy.orm import Session
from datetime import datetime

def get_user(db: Session, username: str) -> RedditUser | None:
    """
    Retrieves a RedditUser by username.
    
    Args:
        db: SQLAlchemy session managed by the caller
        username: Reddit username to look up
        
    Returns:
        RedditUser instance if found, None if not found
    """
    return db.query(RedditUser).filter(
        RedditUser.username == username.lower()
    ).first()

def get_or_create_user(db: Session, username: str) -> RedditUser:
    """
    Retrieves existing RedditUser or creates a new one.

    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to look up or create

    Returns:
        RedditUser instance, existing or newly created
    """
    user = get_user(db, username.lower())

    if user is None:
        user = RedditUser(
            username=username.lower(),
            scrape_status="idle",
            total_posts=0,
            total_comments=0
        )
        db.add(user)
        db.flush()

    return user


def update_scrape_status(db: Session, username: str, status: str) -> None:
    """
    Updates the scrape_status field for a given user.

    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to update
        status: New status string - 'idle', 'in_progress', or 'failed'

    Raises:
        ValueError: If username does not exist in database or status is mismatched
    """
    user = get_user(db, username.lower())

    if user is None:
        raise ValueError(f"User '{username}' not found in database")

    VALID_STATUS ={"idle","in_progress","failed"}
    if status not in VALID_STATUS:
        raise ValueError(f"Invalid staus'{status}.Must be one of the {VALID_STATUS}")
    user.scrape_status = status
    db.flush()

def update_scrape_complete(db: Session, username: str, total_posts: int, total_comments: int) -> None:
    """
    Updates the scrape_status field for a given user.

    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to update
        totalposts
        totalcomments

    Raises:
        ValueError: If username does not exist in database
    """
    user = get_user(db, username.lower())

    if user is None:
        raise ValueError(f"User '{username}' not found in database")

    user.scrape_status = "idle"
    user.total_posts = total_posts
    user.total_comments = total_comments
    user.last_scraped_at =datetime.utcnow()

    db.flush()

def log_scrape_error(db: Session, username: str, error_message: str) -> None:
    """
    log the scrape_error field for a given user.

    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to update
        error_message: error_message

    Raises:
        ValueError: If username does not exist in database
    """
    error = ScrapeError(
        username=username.lower(),
        error_message=error_message
    )
    db.add(error)
    db.flush()



def should_rescrape(db: Session, username: str, max_age_hours: int = 1) -> bool:
    """
    Tells when should rescrape to be done

    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to update
        max_age_hours :how many hours of refresh should we do 

    """
    user = get_user(db,username.lower())
    if user is None:
        return True
    if user.scrape_status == "in_progress":
        return False
    if user.last_scraped_at is None:
        return True
    elif (datetime.utcnow() - user.last_scraped_at ).total_seconds()> (max_age_hours *3600):
        return True
    
    return False
    