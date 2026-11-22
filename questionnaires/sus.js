WebSpheresQuestionnaires.define({
    id: 'SUS',
    version: 1,
    name: 'System Usability Scale',
    title: 'Using the headset',
    type: 'scale',
    instructions: 'For each statement, choose the option that applies best.',
    scale: {
        values: [1, 2, 3, 4, 5],
        labels: ['Strongly disagree', 'Somewhat disagree', 'Undecided', 'Somewhat agree', 'Strongly agree'],
        showNumbers: false
    },
    items: [
        { id: 'SUS01', text: 'I think I would like to use this headset frequently.' },
        { id: 'SUS02', text: 'I found the headset unnecessarily complex.', reverse: true },
        { id: 'SUS03', text: 'I thought the headset was easy to use.' },
        { id: 'SUS04', text: 'I think I’d need the support of a technical person to use this headset.', reverse: true },
        { id: 'SUS05', text: 'I found the various functions in this headset well integrated.' },
        { id: 'SUS06', text: 'I thought there was too much inconsistency in this headset.', reverse: true },
        { id: 'SUS07', text: 'I would imagine that most people would learn to use this headset very quickly.' },
        { id: 'SUS08', text: 'I found the headset very cumbersome to use.', reverse: true },
        { id: 'SUS09', text: 'I felt very confident using the headset.' },
        { id: 'SUS10', text: 'I needed to learn a lot of things before I could get going.', reverse: true }
    ],
    scores: [
        { id: 'SUS_Total', label: 'SUS score (0 to 100)', method: 'sum-from-min', multiply: 2.5, items: 'all' }
    ]
});
