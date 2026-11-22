WebSpheresQuestionnaires.define({
    id: 'GAME',
    version: 1,
    name: 'Game questions',
    title: 'About the game',
    type: 'choice-followup',
    items: [
        {
            id: 'GQ1',
            text: 'Did you notice any changes between the game sessions?',
            options: ['Yes', 'No', 'Unsure'],
            followUp: { Yes: 'What changes did you notice?', '*': 'Why have you chosen that?' }
        },
        {
            id: 'GQ2',
            text: 'Did you use one hand more than the other?',
            options: ['Left', 'Right', 'Both about equally', 'Unsure'],
            followUp: { '*': 'Why do you think that was?' },
            handItem: true
        },
        {
            id: 'GQ3',
            text: 'Do you think the score mechanic motivated you or not?',
            options: ['Yes', 'No', 'Unsure'],
            followUp: { '*': 'Why have you chosen that?' }
        }
    ]
});
