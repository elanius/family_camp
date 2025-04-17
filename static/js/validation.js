document.getElementById('addMember').addEventListener('click', function() {
    const householdMembers = document.getElementById('householdMembers');
    const newMember = document.createElement('div');
    newMember.classList.add('member');

    newMember.innerHTML = `
        <label for="memberName">Name:</label>
        <input type="text" name="memberName[]" required>

        <label for="memberAge">Age:</label>
        <input type="number" name="memberAge[]" required>
    `;

    householdMembers.appendChild(newMember);
});

document.getElementById('registrationForm').addEventListener('submit', function(event) {
    const name = document.getElementById('name').value;
    const age = document.getElementById('age').value;
    const email = document.getElementById('email').value;
    const telephone = document.getElementById('telephone').value;

    if (!name || !age || !email || !telephone) {
        alert('Please fill out all required fields.');
        event.preventDefault();
    }
});
