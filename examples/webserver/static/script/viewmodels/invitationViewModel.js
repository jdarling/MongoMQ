function invitationViewModel() {
    // Data
    var self = this;
    self.id = ko.observable();
    self.title = ko.observable();
    self.choices = ko.observableArray([]);

    self.rsvpUrl = ko.computed(function() {
        if (self.id()) {
            var rootUrl = location.href.replace(/^(https?:\/\/.*?\/).*/, '$1'); // returns http://domain:port/
            return rootUrl + 'rsvp#' + self.id();
        }
    });

    self.mailtoUrl = ko.computed(function() {
        if (self.rsvpUrl()) {
            var subject = 'Invitation: ' + self.title(),
                body = self.title() + "\n\n You\'ve been invited! \n\nTo reply, please go to: " + self.rsvpUrl() + "\n\n Thanks!";
            return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        }
    });

    // Behaviours
    self.addChoice = function() { self.choices.push({ displayText: '' }); }
    self.removeChoice = function(choice) { self.choices.remove(choice); }
    self.save = function() {
        var params = { data: ko.toJSON(self), type: 'post', contentType: 'application/json' };
        $.ajax('/api/invitations', params).done(function(result) {
            self.id(result.id);
        }).fail(function(req) {
            alert("Sorry, couldn't save. Please make sure you're online!");
        });
    }
            
    // Initial state - prepopulate with a blank choices
    self.addChoice();
}