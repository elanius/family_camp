function setCustomValidation(input, message) {
    input.setCustomValidity(message);
}

document.querySelectorAll('input[name="attendance"]').forEach((radio) => {
    radio.addEventListener('change', function() {
        const specificDaysDiv = document.getElementById('specificDays');
        specificDaysDiv.style.display = this.value === 'partial' ? 'block' : 'none';
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registrationForm");
    const apiUrl = "http://localhost:8000/api/register";
    form.action = apiUrl; // Set the form action dynamically
    form.addEventListener("submit", handleFormSubmit);
});

async function handleFormSubmit(event) {
    event.preventDefault(); // Prevent the default form submission

    const form = document.getElementById('registrationForm');

    // Perform form validation
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return; // Stop submission if the form is invalid
    }

    const formData = new FormData(form);

    try {
        const response = await fetch(form.action, {
            method: form.method,
            body: formData,
        });

        if (response.ok) {
            window.location.href = '/confirmation.html';
        } else {
            window.location.href = '/fail.html';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Nastala chyba pri odosielaní údajov.');
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const familyMembersContainer = document.getElementById("familyMembers");
    const addFamilyMemberButton = document.getElementById("addFamilyMember");

    let memberCount = 0;

    function createFamilyMemberFieldset(index) {
        const memberDiv = document.createElement("div");
        memberDiv.classList.add("family-member", "mb-3");
        memberDiv.innerHTML = `
            <label for="familyName${index}" class="form-label">Meno:</label>
            <input type="text" id="familyName${index}" name="familyMembers.${index}.name" class="form-control" required />
            <div class="invalid-feedback">Meno je povinné.</div>
            <label for="familyAge${index}" class="form-label">Vek:</label>
            <input type="number" id="familyAge${index}" name="familyMembers.${index}.age" min="0" max="99" class="form-control" required />
            <div class="invalid-feedback">Vek musí byť číslo medzi 0 a 99.</div>
            <button type="button" class="btn btn-danger mb-2 remove-member">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        memberDiv.querySelector(".remove-member").addEventListener("click", () => {
            memberDiv.remove();
        });
        return memberDiv;
    }

    addFamilyMemberButton.addEventListener("click", () => {
        const newMemberFieldset = createFamilyMemberFieldset(memberCount++);
        familyMembersContainer.appendChild(newMemberFieldset);
    });
});
