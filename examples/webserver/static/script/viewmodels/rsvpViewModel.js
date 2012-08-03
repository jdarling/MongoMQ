function rsvpViewModel(invitationId) {
    var self = this;
    self.invitation = ko.observable();
    self.respondeeName = ko.observable();
    self.respondeeChoices = ko.observableArray();
    self.hasSubmitted = ko.observable(false);

    // Returns a 2-dimensional array to represent a table - rows are votes, columns are possible choices
    self.votesTableData = ko.computed(function() {
        if (self.invitation()) {
            return $.map(self.invitation().votes, function(vote) {
                return {
                    name: vote.name,
                    choices: $.map(self.invitation().choices, function(choice) {
                        return { id: choice.id, isChosen: $.inArray(choice.id, vote.choices) >= 0 };
                    })
                };
            });
        }
    });

    self.submitRsvp = function() {
        var vote = { name: self.respondeeName, choices: self.respondeeChoices },
            params = { data: ko.toJSON(vote), type: 'post', contentType: 'application/json' };
        $.ajax('/api/invitations/' + invitationId + '/votes', params);
        self.hasSubmitted(true);
        refreshData();
    };

    function refreshData() {
        $.getJSON('/api/invitations/' + invitationId, self.invitation).fail(function(req) {
            alert('Sorry - "' + invitationId + '" could not be loaded. Error ' + (req ? req.status : 'unknown'));
        });
    }
    refreshData();
}