const LOCK_STORAGE_KEY = 'frontPageUnlocked';
const LOCK_ATTEMPTS_KEY = 'frontPageLockAttempts';
const LOCK_UNTIL_KEY = 'frontPageLockUntil';
const ACCESS_HASH = '73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049';

async function sha256(value) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function unlockPage(lockScreen, pageContent) {
    sessionStorage.setItem(LOCK_STORAGE_KEY, 'true');
    document.body.classList.remove('site-locked');
    pageContent.setAttribute('aria-hidden', 'false');
    lockScreen.classList.add('is-hidden');
}

function updateCooldown(statusEl, submitBtn) {
    const lockUntil = Number(localStorage.getItem(LOCK_UNTIL_KEY) || 0);
    const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));

    if (remaining > 0) {
        submitBtn.disabled = true;
        statusEl.textContent = `Too many wrong attempts. Try again in ${remaining}s.`;
        return true;
    }

    submitBtn.disabled = false;
    return false;
}

async function initLockScreen() {
    const lockScreen = document.getElementById('lock-screen');
    const lockForm = document.getElementById('lock-form');
    const lockInput = document.getElementById('lock-input');
    const statusEl = document.getElementById('lock-status');
    const submitBtn = lockForm?.querySelector('button[type="submit"]');
    const pageContent = document.getElementById('page-content');

    if (!lockScreen || !lockForm || !lockInput || !statusEl || !submitBtn || !pageContent) {
        return;
    }

    if (sessionStorage.getItem(LOCK_STORAGE_KEY) === 'true') {
        unlockPage(lockScreen, pageContent);
        return;
    }

    lockInput.focus();
    updateCooldown(statusEl, submitBtn);

    const cooldownTimer = window.setInterval(() => {
        updateCooldown(statusEl, submitBtn);
    }, 1000);

    lockForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (updateCooldown(statusEl, submitBtn)) {
            return;
        }

        const candidate = lockInput.value.trim();
        if (!candidate) {
            statusEl.textContent = 'Enter the access code first.';
            return;
        }

        submitBtn.disabled = true;
        statusEl.textContent = 'Checking code...';

        try {
            const hashedCandidate = await sha256(candidate);
            if (hashedCandidate === ACCESS_HASH) {
                localStorage.removeItem(LOCK_ATTEMPTS_KEY);
                localStorage.removeItem(LOCK_UNTIL_KEY);
                window.clearInterval(cooldownTimer);
                unlockPage(lockScreen, pageContent);
                return;
            }

            const attempts = Number(localStorage.getItem(LOCK_ATTEMPTS_KEY) || 0) + 1;
            localStorage.setItem(LOCK_ATTEMPTS_KEY, String(attempts));

            if (attempts >= 3) {
                const cooldownSeconds = Math.min(60, (attempts - 2) * 10);
                localStorage.setItem(LOCK_UNTIL_KEY, String(Date.now() + cooldownSeconds * 1000));
                statusEl.textContent = `Wrong code. Locked for ${cooldownSeconds}s.`;
            } else {
                statusEl.textContent = `Wrong code. ${3 - attempts} attempt${3 - attempts === 1 ? '' : 's'} before a cooldown.`;
            }

            lockInput.select();
            updateCooldown(statusEl, submitBtn);
        } catch (error) {
            console.error('Lock screen error:', error);
            statusEl.textContent = 'Unlock failed because your browser blocked a required feature.';
            submitBtn.disabled = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', initLockScreen);
