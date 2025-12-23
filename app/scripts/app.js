let client;

init();

async function init() {
  client = await app.initialized();
  client.events.on('app.activated', renderText);
}

// Array of random words
const randomWords = [
  'Innovation',
  'Excellence',
  'Collaboration',
  'Creativity',
  'Resilience',
  'Productivity',
  'Growth',
  'Success',
  'Leadership',
  'Quality',
  'Efficiency',
  'Teamwork',
  'Vision',
  'Strategy',
  'Achievement'
];

async function renderText() {
  const textElement = document.getElementById('apptext');
  const contactData = await client.data.get('contact');
  const {
    contact: { name }
  } = contactData;

  textElement.innerHTML = `Ticket is created by ${name}`;

  // Add event listener for description button
  const adviceBtn = document.getElementById('adviceBtn');
  if (adviceBtn) {
    adviceBtn.addEventListener('fwClick', addRandomWord);
  }

  // Add event listener for priority button
  const priorityBtn = document.getElementById('priorityBtn');
  if (priorityBtn) {
    priorityBtn.addEventListener('fwClick', changePriority);
  }

  // Add event listener for custom field button
  const customFieldBtn = document.getElementById('customFieldBtn');
  if (customFieldBtn) {
    customFieldBtn.addEventListener('fwClick', updateCustomField);
  }

  // Add event listener for create post button
  const createPostBtn = document.getElementById('createPostBtn');
  if (createPostBtn) {
    createPostBtn.addEventListener('fwClick', createPostAndUpdate);
  }

  // Add event listener for choices dropdown
  const choicesDropdown = document.getElementById('choicesDropdown');
  if (choicesDropdown) {
    choicesDropdown.addEventListener('fwChange', async (event) => {
      const selectedValue = event.detail.value;
      if (selectedValue) {
        await updateChoicesField(selectedValue);
      }
    });

    // Load current Choices field value
    try {
      const ticketData = await client.data.get('ticket');
      const fieldsResponse = await client.request.invokeTemplate('getTicketFields');
      const fields = JSON.parse(fieldsResponse.response);
      const choicesField = fields.find(f => f.label === 'Choices');
      
      if (choicesField) {
        const fieldName = choicesField.name;
        const currentValue = ticketData.ticket.custom_fields?.[fieldName];
        
        if (currentValue) {
          choicesDropdown.value = currentValue;
          console.log('Loaded current Choices value:', currentValue);
        }
      }
    } catch (error) {
      console.log('Could not load current Choices value:', error);
    }
  }
}

async function addRandomWord() {
  const statusMessage = document.getElementById('statusMessage');

  statusMessage.innerHTML = 'Adding word...';
  statusMessage.style.color = 'blue';

  try {
    // Get random word from array
    const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];

    // Get current ticket data
    const ticketData = await client.data.get('ticket');
    const ticketId = ticketData.ticket.id;
    const currentDescription = ticketData.ticket.description || '';

    // Append random word to ticket description
    const newDescription = `${currentDescription}\n\nRandom Word: ${randomWord}`;

    // Update ticket description
    await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticketId },
      body: JSON.stringify({ description: newDescription })
    });

    statusMessage.innerHTML = `Added: ${randomWord}`;
    statusMessage.style.color = 'green';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('Error adding random word:', error);
    statusMessage.innerHTML = `Error: ${error.message || 'Failed'}`;
    statusMessage.style.color = 'red';
  }
}

async function changePriority() {
  const statusMessage = document.getElementById('statusMessage');

  statusMessage.innerHTML = 'Updating...';
  statusMessage.style.color = 'blue';

  try {
    // Priority options: 1=Low, 2=Medium, 3=High, 4=Urgent
    const priorities = [
      { value: 1, name: 'Low' },
      { value: 2, name: 'Medium' },
      { value: 3, name: 'High' },
      { value: 4, name: 'Urgent' }
    ];

    // Pick a random priority
    const randomPriority = priorities[Math.floor(Math.random() * priorities.length)];

    // Get current ticket data
    const ticketData = await client.data.get('ticket');
    const ticketId = ticketData.ticket.id;

    // Update ticket priority via API (saves to database)
    await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticketId },
      body: JSON.stringify({ priority: randomPriority.value })
    });

    // Update UI immediately without page refresh using interface method
    await client.interface.trigger("setValue", {
      id: "priority",
      value: randomPriority.value
    });

    statusMessage.innerHTML = `Priority: ${randomPriority.name}`;
    statusMessage.style.color = 'green';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('Error changing priority:', error);
    statusMessage.innerHTML = `Error: ${error.message || 'Failed'}`;
    statusMessage.style.color = 'red';
  }
}

async function updateCustomField() {
  const statusMessage = document.getElementById('statusMessage');

  statusMessage.innerHTML = 'Getting joke...';
  statusMessage.style.color = 'blue';

  try {
    // Call external joke API
    const jokeResponse = await client.request.invokeTemplate('getRandomJoke');
    const joke = JSON.parse(jokeResponse.response);

    console.log('Joke API response:', joke);

    // Combine setup and punchline
    const jokeText = `${joke.setup} - ${joke.punchline}`;
    console.log('Joke text:', jokeText);

    // Get current ticket data
    const ticketData = await client.data.get('ticket');
    const ticketId = ticketData.ticket.id;

    console.log('Ticket ID:', ticketId);

    // Get all ticket fields to find the custom field
    const fieldsResponse = await client.request.invokeTemplate('getTicketFields');
    const fields = JSON.parse(fieldsResponse.response);
    console.log('All ticket fields:', fields);

    // Find custom field by label 'cf_random_word'
    const customField = fields.find(f => f.label === 'Jokes' || f.name === "cf_cf_random_word");
    console.log('Found custom field:', customField);

    if (!customField) {
      throw new Error('Custom field not found');
    }

    // Use the actual field name from the API
    const fieldName = customField.name;
    console.log('Using field name:', fieldName);

    // Prepare update payload
    const updatePayload = {
      custom_fields: {
        [fieldName]: jokeText
      }
    };

    console.log('Sending update payload:', JSON.stringify(updatePayload, null, 2));

    // Update via API
    const updateResponse = await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticketId },
      body: JSON.stringify(updatePayload)
    });

    console.log('Update response:', updateResponse);

    // Try to update UI immediately
    try {
      await client.interface.trigger("setValue", {
        id: fieldName,
        value: jokeText
      });
    } catch (uiError) {
      console.log('UI update not supported:', uiError);
    }

    statusMessage.innerHTML = `Joke added!`;
    statusMessage.style.color = 'green';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('Full error details:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    statusMessage.innerHTML = `Error: ${error.message || 'Update failed'}`;
    statusMessage.style.color = 'red';
  }
}

async function createPostAndUpdate() {
  const statusMessage = document.getElementById('statusMessage');
  const inputElement = document.getElementById('postTitleInput');

  statusMessage.innerHTML = 'Creating post...';
  statusMessage.style.color = 'blue';

  try {
    // Get input value from the fw-input component
    const title = inputElement.value;

    if (!title || title.trim() === '') {
      statusMessage.innerHTML = 'Please enter a title';
      statusMessage.style.color = 'orange';
      return;
    }

    console.log('Creating post with title:', title);

    // Make POST request to JSONPlaceholder API
    const postResponse = await client.request.invokeTemplate('createPost', {
      body: JSON.stringify({ title: title })
    });

    const postData = JSON.parse(postResponse.response);
    console.log('Post created:', postData);

    const postId = postData.id;
    const postTitle = postData.title;
    console.log('Post ID:', postId);

    // Get current ticket data
    const ticketData = await client.data.get('ticket');
    const ticketId = ticketData.ticket.id;

    console.log('Ticket ID:', ticketId);

    // Get all ticket fields to find the custom field
    const fieldsResponse = await client.request.invokeTemplate('getTicketFields');
    const fields = JSON.parse(fieldsResponse.response);
    console.log('All ticket fields:', fields);

    // Find custom field by label 'Jokes' or name 'cf_cf_random_word'
    const customField = fields.find(f => f.label === 'API' || f.name === "cf_api");
    console.log('Found custom field:', customField);

    if (!customField) {
      throw new Error('Custom field not found');
    }

    // Use the actual field name from the API
    const fieldName = customField.name;
    console.log('Using field name:', fieldName);

    // Prepare update payload with the post ID and title
    const updatePayload = {
      custom_fields: {
        [fieldName]: `Post: ${postId}-${postTitle}`
      }
    };

    console.log('Sending update payload:', JSON.stringify(updatePayload, null, 2));

    // Update via API
    const updateResponse = await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticketId },
      body: JSON.stringify(updatePayload)
    });

    console.log('Update response:', updateResponse);

    // Try to update UI immediately
    try {
      await client.interface.trigger("setValue", {
        id: fieldName,
        value: `Post: ${postId}-${postTitle}`
      });
    } catch (uiError) {
      console.log('UI update not supported:', uiError);
    }

    statusMessage.innerHTML = `Post created! ID: ${postId}`;
    statusMessage.style.color = 'green';

    // Clear input field
    inputElement.value = '';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('Full error details:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    statusMessage.innerHTML = `Error: ${error.message || 'Failed'}`;
    statusMessage.style.color = 'red';
  }
}

async function updateChoicesField(selectedValue) {
  const statusMessage = document.getElementById('statusMessage');

  statusMessage.innerHTML = 'Updating Choices...';
  statusMessage.style.color = 'blue';

  try {
    // Get current ticket data
    const ticketData = await client.data.get('ticket');
    const ticketId = ticketData.ticket.id;

    console.log('Ticket ID:', ticketId);
    console.log('Selected value:', selectedValue);

    // Get all ticket fields to find the custom field
    const fieldsResponse = await client.request.invokeTemplate('getTicketFields');
    const fields = JSON.parse(fieldsResponse.response);
    console.log('All ticket fields:', fields);

    // Find custom field by label 'Choices'
    const customField = fields.find(f => f.label === 'Choices');
    console.log('Found custom field:', customField);

    if (!customField) {
      throw new Error('Custom field "Choices" not found');
    }

    // Use the actual field name from the API
    const fieldName = customField.name;
    console.log('Using field name:', fieldName);

    // Prepare update payload
    const updatePayload = {
      custom_fields: {
        [fieldName]: selectedValue
      }
    };

    console.log('Sending update payload:', JSON.stringify(updatePayload, null, 2));

    // Update via API
    const updateResponse = await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticketId },
      body: JSON.stringify(updatePayload)
    });

    console.log('Update response:', updateResponse);

    // Try to update UI immediately
    try {
      await client.interface.trigger("setValue", {
        id: fieldName,
        value: selectedValue
      });
    } catch (uiError) {
      console.log('UI update not supported:', uiError);
    }

    statusMessage.innerHTML = `Choices updated to: ${selectedValue}`;
    statusMessage.style.color = 'green';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('Full error details:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    statusMessage.innerHTML = `Error: ${error.message || 'Update failed'}`;
    statusMessage.style.color = 'red';
  }
}
